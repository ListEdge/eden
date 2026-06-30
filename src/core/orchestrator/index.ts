/**
 * Eden — Orchestrator.
 *
 * Sequences a Work Package through the lifecycle and now threads each request
 * through a CONVERSATION, so follow-ups resolve in context. It coordinates the
 * other planes but performs none of their work itself: Reasoning decides,
 * Execution acts (via tools), Memory persists. The Orchestrator remains the only
 * writer of Work Package status (Core Contract §2, Rule 10).
 *
 * `runConversationTurn`:
 *   1. Loads recent conversation turns as context.
 *   2. UNDERSTAND + Gate A (context-aware).
 *   3. If the request is to find a place → builds a one-action plan and drives the
 *      real state machine (PLANNED → EXECUTING → VERIFYING → COMPLETED), running
 *      the `places.search` tool; missing location halts at BLOCKED_ON_INPUT, a
 *      tool failure goes to FAILED.
 *   4. Otherwise → produces a grounded conversational reply.
 *   Every turn (yours and Eden's) is appended to the conversation memory.
 */

import { createHash } from 'node:crypto';
import { NotImplementedError } from '@/lib/errors';
import { getReasoningProvider } from '@/lib/ai/registry';
import { SYSTEM_PRINCIPAL_ID, SYSTEM_TENANT_ID } from '@/lib/config/constants';
import { getDefaultLocation } from '@/lib/config/env';
import { memoryApi, type ConversationTurn } from '@/core/memory';
import { reasoningPlane, type Question, type Understanding } from '@/core/reasoning';
import { toolRegistry } from '@/core/tool-registry';
import { ensureToolsRegistered, PLACES_SEARCH_TOOL } from '@/core/tools';
import type { PlaceResult } from '@/lib/places';
import type {
  WorkPackageIntent,
  WorkPackageSpec,
  WpStatus,
} from '@/core/work-package/types';

export * from '@/core/orchestrator/types';

/** Outcome of one conversation turn. */
export interface TurnResult {
  conversation_id: string;
  request_id: string;
  work_package_id: string;
  status: WpStatus;
  understanding: Understanding;
  gate_a: { proceeded: boolean; questions?: Question[] };
  /** Natural-language reply for display + speech (set on every turn). */
  reply: string;
  /** Present when a place-search ran successfully. */
  results?: PlaceResult[];
  /** Present when the turn ended in FAILED. */
  error?: string;
  note: string;
}

/** Render recent turns as plain text the model can reason over. */
function buildContext(turns: ConversationTurn[]): string {
  return turns
    .map((t) => `${t.role === 'user' ? 'User' : 'Eden'}: ${t.content}`)
    .join('\n');
}

/** A compact, reference-friendly memory of a place-search result. */
function resultsToMemory(results: PlaceResult[], location: string, cuisine: string | null): string {
  if (results.length === 0) return `Searched for ${cuisine ?? ''} places near ${location} but found none.`;
  const lines = results.map((r, i) => {
    const dist = typeof r.distanceMeters === 'number' ? ` (${Math.round(r.distanceMeters)}m)` : '';
    const addr = r.address ? ` — ${r.address}` : '';
    return `${i + 1}. ${r.name}${dist}${addr}`;
  });
  return `Found ${results.length} ${cuisine ? `${cuisine} ` : ''}place(s) near ${location}:\n${lines.join('\n')}`;
}

/** A short spoken summary of a place-search result. */
function resultsToReply(results: PlaceResult[], location: string, cuisine: string | null): string {
  if (results.length === 0) {
    return `I couldn't find any ${cuisine ?? ''} places near ${location}.`;
  }
  const names = results.slice(0, 3).map((r) => r.name);
  const list = names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}` : names[0];
  const c = cuisine ? `${cuisine} ` : '';
  return `I found ${results.length} ${c}options near ${location}. The closest ${names.length > 1 ? 'are' : 'is'} ${list}. Want details on any of them?`;
}

export async function runConversationTurn(
  rawRequest: string,
  conversationId?: string,
): Promise<TurnResult> {
  const tenantId = SYSTEM_TENANT_ID;
  const principalId = SYSTEM_PRINCIPAL_ID;

  // Resolve or open the conversation, and load prior turns as context.
  const convoId = conversationId ?? (await memoryApi.createConversation(tenantId, principalId));
  const priorTurns = conversationId ? await memoryApi.getRecentTurns(convoId, 8) : [];
  const contextText = buildContext(priorTurns);

  // Record the user's turn.
  await memoryApi.appendTurn(convoId, 'user', rawRequest);

  // INGEST + open the Work Package at RECEIVED.
  const request = await memoryApi.createRequest({
    tenant_id: tenantId,
    principal_id: principalId,
    raw_text: rawRequest,
  });
  const wp = await memoryApi.openWorkPackage(
    { raw_request: rawRequest },
    { tenantId, requestId: request.id, principalId },
  );

  // UNDERSTAND (context-aware) + trace + spec.
  const understanding = await reasoningPlane.understand(
    {
      id: request.id,
      tenant_id: tenantId,
      principal_id: principalId,
      raw_text: rawRequest,
      received_at: request.received_at,
    },
    contextText,
  );
  await memoryApi.recordTrace({
    work_package_id: wp.id,
    stage: 'UNDERSTAND',
    model: getReasoningProvider().defaultModel,
    prompt_hash: createHash('sha256').update(rawRequest).digest('hex'),
    input: { request_id: request.id, has_context: priorTurns.length > 0 },
    output: understanding as unknown as Record<string, unknown>,
  });
  const intent: WorkPackageIntent = {
    raw_request: rawRequest,
    interpreted_goal: understanding.goal,
    out_of_scope: understanding.out_of_scope,
  };
  const spec: WorkPackageSpec = {
    constraints: understanding.constraints,
    assumptions: understanding.assumptions,
    inputs_required: understanding.unknowns,
    acceptance_criteria: [],
  };
  await memoryApi.saveSpecification(wp.id, { intent, spec });
  await memoryApi.transition(wp.id, 'SPECIFIED', {
    trigger: 'Reasoning.understand',
    actor: 'orchestrator',
  });

  const base = {
    conversation_id: convoId,
    request_id: request.id,
    work_package_id: wp.id,
    understanding,
  };

  // Gate A — completeness.
  const gate = await reasoningPlane.gateA(understanding);
  if (!gate.proceed) {
    const reply =
      gate.questions?.[0]?.text ?? 'I need a little more information to continue.';
    await blockOnInput(wp.id, tenantId, gate.questions ?? [], 'Gate A fail');
    await memoryApi.appendTurn(convoId, 'assistant', reply, { workPackageId: wp.id });
    return {
      ...base,
      status: 'BLOCKED_ON_INPUT',
      gate_a: { proceeded: false, questions: gate.questions },
      reply,
      note: 'Eden halted at Gate A and asked for clarification.',
    };
  }

  // Place search, or a conversational reply?
  const placeIntent = await reasoningPlane.extractPlaceQuery(rawRequest, understanding, contextText);

  if (!placeIntent.is_place_search) {
    // Conversational turn — grounded reply over the conversation context.
    const reply = await reasoningPlane.converse(contextText, rawRequest);
    await memoryApi.appendTurn(convoId, 'assistant', reply, { workPackageId: wp.id });
    return {
      ...base,
      status: 'SPECIFIED',
      gate_a: { proceeded: true },
      reply,
      note: 'Conversational reply (no tool action taken).',
    };
  }

  // Place search needs a location.
  const location = placeIntent.location ?? getDefaultLocation();
  if (!location) {
    const questions: Question[] = [
      { id: 'q1', text: 'Which area should I search? (e.g. your suburb or city)', kind: 'free' },
    ];
    const reply = questions[0].text;
    await blockOnInput(wp.id, tenantId, questions, 'Missing location');
    await memoryApi.appendTurn(convoId, 'assistant', reply, { workPackageId: wp.id });
    return {
      ...base,
      status: 'BLOCKED_ON_INPUT',
      gate_a: { proceeded: true },
      reply,
      note: 'Eden needs a location before it can search.',
    };
  }

  // Drive the read-only execution path.
  ensureToolsRegistered();
  await memoryApi.transition(wp.id, 'PLANNED', {
    trigger: 'Planner (built-in: places.search)',
    actor: 'orchestrator',
    guard_context: { tool: PLACES_SEARCH_TOOL, location, cuisine: placeIntent.cuisine },
  });
  await memoryApi.transition(wp.id, 'EXECUTING', {
    trigger: 'Gate B (level 1)',
    actor: 'orchestrator',
  });

  const tool = toolRegistry.get(PLACES_SEARCH_TOOL);
  const toolResult = await tool.run(
    { location, cuisine: placeIntent.cuisine, limit: 8 },
    `${wp.id}:${PLACES_SEARCH_TOOL}`,
  );
  await memoryApi.appendEvent({
    tenant_id: tenantId,
    work_package_id: wp.id,
    type: 'TOOL_CALL',
    payload: { tool: PLACES_SEARCH_TOOL, ok: toolResult.ok, location, cuisine: placeIntent.cuisine },
    actor: 'execution',
  });

  if (!toolResult.ok) {
    await memoryApi.transition(wp.id, 'FAILED', {
      trigger: 'Action failed',
      actor: 'orchestrator',
      guard_context: { error: toolResult.error?.message ?? 'tool failed' },
    });
    const reply = 'I tried to search, but the lookup failed. You could try again in a moment.';
    await memoryApi.appendTurn(convoId, 'assistant', reply, { workPackageId: wp.id });
    return {
      ...base,
      status: 'FAILED',
      gate_a: { proceeded: true },
      error: toolResult.error?.message ?? 'The place search failed.',
      reply,
      note: 'The tool failed; the failure is recorded in the audit trail.',
    };
  }

  const output = (toolResult.output ?? {}) as { results?: PlaceResult[] };
  const results = output.results ?? [];
  await memoryApi.transition(wp.id, 'VERIFYING', {
    trigger: 'All actions terminal-success',
    actor: 'orchestrator',
  });
  await memoryApi.transition(wp.id, 'COMPLETED', {
    trigger: 'Verify pass',
    actor: 'orchestrator',
  });

  const reply = resultsToReply(results, location, placeIntent.cuisine);
  await memoryApi.appendTurn(
    convoId,
    'assistant',
    resultsToMemory(results, location, placeIntent.cuisine),
    { data: { results }, workPackageId: wp.id },
  );

  return {
    ...base,
    status: 'COMPLETED',
    gate_a: { proceeded: true },
    results,
    reply,
    note: `Eden ran the full loop and found ${results.length} place(s) near ${location}.`,
  };
}

/** Transition a package to BLOCKED_ON_INPUT and log the clarification. */
async function blockOnInput(
  wpId: string,
  tenantId: string,
  questions: Question[],
  trigger: string,
): Promise<void> {
  await memoryApi.transition(wpId, 'BLOCKED_ON_INPUT', {
    trigger,
    actor: 'orchestrator',
    guard_context: { question_count: questions.length },
  });
  await memoryApi.appendEvent({
    tenant_id: tenantId,
    work_package_id: wpId,
    type: 'CLARIFICATION_RAISED',
    payload: { questions },
    actor: 'orchestrator',
  });
}

export interface Orchestrator {
  /** Pump the state machine to the next halt or terminal state. */
  drive(wpId: string): Promise<void>;
}

/** The full durable loop is built out across later phases. */
export const orchestrator: Orchestrator = {
  drive() {
    throw new NotImplementedError('Orchestrator.drive', 'Orchestration milestone (Phases 1–4)');
  },
};
