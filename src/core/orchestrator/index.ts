/**
 * Eden — Orchestrator.
 *
 * Runs one conversation turn. For speed, a single combined Reasoning call
 * (`routeTurn`) decides how to handle the turn and, for plain conversation,
 * writes the reply — instead of separate understand/classify/converse calls.
 *
 * Two paths:
 *   • chat  → a fast, grounded reply. Lightweight: it records the conversation
 *     turns but does not spin up the full Work Package audit pipeline.
 *   • find_place → the audited action path: opens a Work Package and drives the
 *     real state machine (PLANNED → EXECUTING → VERIFYING → COMPLETED) running
 *     the `places.search` tool; a missing location halts at BLOCKED_ON_INPUT and
 *     a tool failure goes to FAILED. The Orchestrator remains the only writer of
 *     status (Core Contract §2, Rule 10).
 *
 * Every turn (yours and Eden's) is appended to the conversation memory.
 */

import { createHash } from 'node:crypto';
import { NotImplementedError } from '@/lib/errors';
import { getReasoningProvider } from '@/lib/ai/registry';
import { SYSTEM_PRINCIPAL_ID, SYSTEM_TENANT_ID } from '@/lib/config/constants';
import { getDefaultLocation } from '@/lib/config/env';
import { memoryApi, type ConversationTurn } from '@/core/memory';
import { reasoningPlane, type BusinessPlan } from '@/core/reasoning';
import { toolRegistry } from '@/core/tool-registry';
import { ensureToolsRegistered, PLACES_SEARCH_TOOL } from '@/core/tools';
import type { PlaceResult } from '@/lib/places';
import type {
  WorkPackageIntent,
  WorkPackageSpec,
} from '@/core/work-package/types';

export * from '@/core/orchestrator/types';

/** Outcome of one conversation turn. */
export interface TurnResult {
  conversation_id: string;
  status: string;
  /** Natural-language reply for display + speech. */
  reply: string;
  /** Present when a place-search ran. */
  results?: PlaceResult[];
  /** Present when the action path ended in FAILED. */
  error?: string;
  /** Present on the audited action path. */
  work_package_id?: string;
  /** Present when a written plan was generated. */
  plan?: BusinessPlan;
  note?: string;
}

const TENANT = SYSTEM_TENANT_ID;
const PRINCIPAL = SYSTEM_PRINCIPAL_ID;

/** Render recent turns as plain text the model can reason over. */
function buildContext(turns: ConversationTurn[]): string {
  return turns.map((t) => `${t.role === 'user' ? 'User' : 'Eden'}: ${t.content}`).join('\n');
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
  if (results.length === 0) return `I couldn't find any ${cuisine ?? ''} places near ${location}.`;
  const names = results.slice(0, 3).map((r) => r.name);
  const list =
    names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}` : names[0];
  const c = cuisine ? `${cuisine} ` : '';
  return `I found ${results.length} ${c}options near ${location}. The closest ${names.length > 1 ? 'are' : 'is'} ${list}. Want details on any of them?`;
}

/** Compact text of a plan, stored in conversation memory so follow-ups have context. */
function planToMemoryText(p: BusinessPlan): string {
  const s = p.plan;
  return [
    `Plan for ${p.title || 'the idea'}.`,
    p.concept && `Concept: ${p.concept}`,
    s.problem && `Problem: ${s.problem}`,
    s.solution && `Solution: ${s.solution}`,
    s.target_customer && `Customer: ${s.target_customer}`,
    s.value_proposition && `Value: ${s.value_proposition}`,
    s.business_model && `Business model: ${s.business_model}`,
    s.go_to_market && `Go-to-market: ${s.go_to_market}`,
    p.branding?.name_ideas?.length ? `Name ideas: ${p.branding.name_ideas.join(', ')}` : '',
  ]
    .filter(Boolean)
    .join('\n');
}

export async function runConversationTurn(
  rawRequest: string,
  conversationId?: string,
): Promise<TurnResult> {
  // Resolve/open the conversation and load prior turns as context.
  const convoId = conversationId ?? (await memoryApi.createConversation(TENANT, PRINCIPAL));
  const priorTurns = conversationId ? await memoryApi.getRecentTurns(convoId, 8) : [];
  const contextText = buildContext(priorTurns);

  // Record the user's turn.
  await memoryApi.appendTurn(convoId, TENANT, 'user', rawRequest);

  // One combined call: route + (for chat) reply.
  const route = await reasoningPlane.routeTurn(rawRequest, contextText);

  if (route.action === 'generate_plan') {
    // ── Written plan (thinking deliverable; lightweight, no Work Package) ──
    let plan: BusinessPlan | null = null;
    try {
      plan = await reasoningPlane.generatePlan(rawRequest, contextText);
    } catch {
      plan = null;
    }
    if (!plan) {
      const reply = "I wasn't able to put the plan together just then — give it another go in a moment.";
      await memoryApi.appendTurn(convoId, TENANT, 'assistant', reply);
      return { conversation_id: convoId, status: 'replied', reply, note: 'Plan generation failed.' };
    }
    const title = plan.title || 'your idea';
    const reply = `Here's a first plan for ${title}. I've laid out the concept, a business plan, and some branding directions below — tell me what to sharpen.`;
    await memoryApi.appendTurn(convoId, TENANT, 'assistant', planToMemoryText(plan), {
      data: { plan },
    });
    return { conversation_id: convoId, status: 'planned', reply, plan, note: 'Generated a written plan.' };
  }

  if (route.action !== 'find_place') {
    // ── Fast conversational path (no Work Package) ──
    const reply = route.reply || "I'm not sure how to help with that yet.";
    await memoryApi.appendTurn(convoId, TENANT, 'assistant', reply);
    return { conversation_id: convoId, status: 'replied', reply, note: 'Conversational reply.' };
  }

  // ── Audited action path: find a place ──
  const location = route.location ?? getDefaultLocation();

  const request = await memoryApi.createRequest({
    tenant_id: TENANT,
    principal_id: PRINCIPAL,
    raw_text: rawRequest,
  });
  const wp = await memoryApi.openWorkPackage(
    { raw_request: rawRequest },
    { tenantId: TENANT, requestId: request.id, principalId: PRINCIPAL },
  );

  // Persist intent/spec + record the routing decision (in parallel), then move to SPECIFIED.
  const intent: WorkPackageIntent = {
    raw_request: rawRequest,
    interpreted_goal: route.goal,
    out_of_scope: [],
  };
  const spec: WorkPackageSpec = {
    constraints: [],
    assumptions: [],
    inputs_required: location ? [] : ['location'],
    acceptance_criteria: [],
  };
  await Promise.all([
    memoryApi.saveSpecification(wp.id, { intent, spec }),
    memoryApi.recordTrace({
      work_package_id: wp.id,
      stage: 'PLAN',
      model: getReasoningProvider().defaultModel,
      prompt_hash: createHash('sha256').update(rawRequest).digest('hex'),
      input: { request_id: request.id, has_context: priorTurns.length > 0 },
      output: { action: route.action, cuisine: route.cuisine, location: location ?? null },
    }),
  ]);
  await memoryApi.transition(wp.id, 'SPECIFIED', {
    trigger: 'Reasoning.routeTurn',
    actor: 'orchestrator',
  });

  // Need a location to search.
  if (!location) {
    const reply = 'Which area should I search? (e.g. your suburb or city)';
    await memoryApi.transition(wp.id, 'BLOCKED_ON_INPUT', {
      trigger: 'Missing location',
      actor: 'orchestrator',
    });
    await memoryApi.appendEvent({
      tenant_id: TENANT,
      work_package_id: wp.id,
      type: 'CLARIFICATION_RAISED',
      payload: { question: reply },
      actor: 'orchestrator',
    });
    await memoryApi.appendTurn(convoId, TENANT, 'assistant', reply, { workPackageId: wp.id });
    return {
      conversation_id: convoId,
      status: 'BLOCKED_ON_INPUT',
      reply,
      work_package_id: wp.id,
      note: 'Eden needs a location before it can search.',
    };
  }

  // Drive the read-only execution path.
  ensureToolsRegistered();
  await memoryApi.transition(wp.id, 'PLANNED', {
    trigger: 'Planner (built-in: places.search)',
    actor: 'orchestrator',
    guard_context: { tool: PLACES_SEARCH_TOOL, location, cuisine: route.cuisine },
  });
  await memoryApi.transition(wp.id, 'EXECUTING', {
    trigger: 'Gate B (level 1)',
    actor: 'orchestrator',
  });

  const tool = toolRegistry.get(PLACES_SEARCH_TOOL);
  const toolResult = await tool.run(
    { location, cuisine: route.cuisine, limit: 8 },
    `${wp.id}:${PLACES_SEARCH_TOOL}`,
  );
  await memoryApi.appendEvent({
    tenant_id: TENANT,
    work_package_id: wp.id,
    type: 'TOOL_CALL',
    payload: { tool: PLACES_SEARCH_TOOL, ok: toolResult.ok, location, cuisine: route.cuisine },
    actor: 'execution',
  });

  if (!toolResult.ok) {
    await memoryApi.transition(wp.id, 'FAILED', {
      trigger: 'Action failed',
      actor: 'orchestrator',
      guard_context: { error: toolResult.error?.message ?? 'tool failed' },
    });
    const reply = 'I tried to search, but the lookup failed. You could try again in a moment.';
    await memoryApi.appendTurn(convoId, TENANT, 'assistant', reply, { workPackageId: wp.id });
    return {
      conversation_id: convoId,
      status: 'FAILED',
      reply,
      error: toolResult.error?.message ?? 'The place search failed.',
      work_package_id: wp.id,
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

  const reply = resultsToReply(results, location, route.cuisine);
  await memoryApi.appendTurn(
    convoId,
    TENANT,
    'assistant',
    resultsToMemory(results, location, route.cuisine),
    { data: { results }, workPackageId: wp.id },
  );

  return {
    conversation_id: convoId,
    status: 'COMPLETED',
    reply,
    results,
    work_package_id: wp.id,
    note: `Eden ran the full loop and found ${results.length} place(s) near ${location}.`,
  };
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
