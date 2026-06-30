/**
 * Eden — Orchestrator.
 *
 * Sequences a Work Package through the lifecycle. It coordinates the other
 * modules but performs none of their work itself: Reasoning decides, Execution
 * acts (via tools), Memory persists. Crucially, the Orchestrator is the ONLY
 * component that asks Memory to change a Work Package's status (Core Contract
 * §2, Rule 10).
 *
 * Milestone 2 path (`runReadOnlyIntake`): ingest → understand → specify →
 * Gate A. If the request asks to find a place (e.g. a restaurant), the
 * Orchestrator builds a one-action read-only plan and drives the real state
 * machine — PLANNED → EXECUTING → VERIFYING → COMPLETED — running the
 * `places.search` tool and returning live results. A missing location halts at
 * BLOCKED_ON_INPUT; a tool failure transitions to FAILED. Non-place requests
 * park at SPECIFIED (planning for the general case is a later milestone).
 */

import { createHash } from 'node:crypto';
import { NotImplementedError } from '@/lib/errors';
import { getReasoningProvider } from '@/lib/ai/registry';
import {
  SYSTEM_PRINCIPAL_ID,
  SYSTEM_TENANT_ID,
} from '@/lib/config/constants';
import { getDefaultLocation } from '@/lib/config/env';
import { memoryApi } from '@/core/memory';
import {
  reasoningPlane,
  type Question,
  type Understanding,
} from '@/core/reasoning';
import { toolRegistry } from '@/core/tool-registry';
import { ensureToolsRegistered, PLACES_SEARCH_TOOL } from '@/core/tools';
import type { PlaceResult } from '@/lib/places';
import type {
  WorkPackageIntent,
  WorkPackageSpec,
  WpStatus,
} from '@/core/work-package/types';

export * from '@/core/orchestrator/types';

/** Outcome of the read-only intake path. */
export interface IntakeResult {
  request_id: string;
  work_package_id: string;
  status: WpStatus;
  understanding: Understanding;
  gate_a: { proceeded: boolean; questions?: Question[] };
  /** Present when a place-search ran successfully. */
  results?: PlaceResult[];
  /** Present when the run ended in FAILED. */
  error?: string;
  note: string;
}

/**
 * Drive a request through the read-only front of the loop. Every status change
 * goes through `memoryApi.transition`, keeping the Orchestrator the single
 * writer of status.
 */
export async function runReadOnlyIntake(rawRequest: string): Promise<IntakeResult> {
  const tenantId = SYSTEM_TENANT_ID;
  const principalId = SYSTEM_PRINCIPAL_ID;

  // Stage 1 — INGEST: capture the raw request immutably.
  const request = await memoryApi.createRequest({
    tenant_id: tenantId,
    principal_id: principalId,
    raw_text: rawRequest,
  });

  // Open the Work Package at RECEIVED (Build Spec T1).
  const wp = await memoryApi.openWorkPackage(
    { raw_request: rawRequest },
    { tenantId, requestId: request.id, principalId },
  );

  // Stage 2 — UNDERSTAND: a real, schema-validated model call.
  const understanding = await reasoningPlane.understand({
    id: request.id,
    tenant_id: tenantId,
    principal_id: principalId,
    raw_text: rawRequest,
    received_at: request.received_at,
  });

  // Record the reasoning trace (the "why" behind what follows).
  await memoryApi.recordTrace({
    work_package_id: wp.id,
    stage: 'UNDERSTAND',
    model: getReasoningProvider().defaultModel,
    prompt_hash: createHash('sha256').update(rawRequest).digest('hex'),
    input: { request_id: request.id },
    output: understanding as unknown as Record<string, unknown>,
  });

  // Persist the interpreted intent + spec.
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

  // T2: RECEIVED -> SPECIFIED.
  await memoryApi.transition(wp.id, 'SPECIFIED', {
    trigger: 'Reasoning.understand',
    actor: 'orchestrator',
  });

  // Gate A — completeness / ambiguity.
  const gate = await reasoningPlane.gateA(understanding);
  if (!gate.proceed) {
    await blockOnInput(wp.id, tenantId, gate.questions ?? [], 'Gate A fail');
    return {
      request_id: request.id,
      work_package_id: wp.id,
      status: 'BLOCKED_ON_INPUT',
      understanding,
      gate_a: { proceeded: false, questions: gate.questions },
      note: 'Eden halted at Gate A: the request needs clarification before it can be planned. Answering these questions will resume it (the clarification-resume loop lands in a later milestone).',
    };
  }

  // Is this a request to find a place (restaurant, café, …)?
  const placeIntent = await reasoningPlane.extractPlaceQuery(rawRequest, understanding);
  if (!placeIntent.is_place_search) {
    return {
      request_id: request.id,
      work_package_id: wp.id,
      status: 'SPECIFIED',
      understanding,
      gate_a: { proceeded: true },
      note: 'Eden understood the request and it passed Gate A. No built-in tool applies to it yet, so the Work Package is parked at SPECIFIED with its full interpretation and audit trail stored (general planning lands in a later milestone).',
    };
  }

  // We need a location. Use the one stated in the request, else a configured default.
  const location = placeIntent.location ?? getDefaultLocation();
  if (!location) {
    const questions: Question[] = [
      { id: 'q1', text: 'Which area should I search? (e.g. your suburb or city)', kind: 'free' },
    ];
    await blockOnInput(wp.id, tenantId, questions, 'Missing location');
    return {
      request_id: request.id,
      work_package_id: wp.id,
      status: 'BLOCKED_ON_INPUT',
      understanding,
      gate_a: { proceeded: true },
      note: 'Eden understood you want to find somewhere to go, but no location was given. Tell it an area (or set a default location) and it can search.',
    };
  }

  // Build a one-action read-only plan and drive execution.
  ensureToolsRegistered();

  // T3: SPECIFIED -> PLANNED.
  await memoryApi.transition(wp.id, 'PLANNED', {
    trigger: 'Planner (built-in: places.search)',
    actor: 'orchestrator',
    guard_context: { tool: PLACES_SEARCH_TOOL, location, cuisine: placeIntent.cuisine },
  });
  // T7: PLANNED -> EXECUTING (Level 1, no approval required).
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
    payload: {
      tool: PLACES_SEARCH_TOOL,
      ok: toolResult.ok,
      location,
      cuisine: placeIntent.cuisine,
    },
    actor: 'execution',
  });

  if (!toolResult.ok) {
    // T12: EXECUTING -> FAILED.
    await memoryApi.transition(wp.id, 'FAILED', {
      trigger: 'Action failed',
      actor: 'orchestrator',
      guard_context: { error: toolResult.error?.message ?? 'tool failed' },
    });
    return {
      request_id: request.id,
      work_package_id: wp.id,
      status: 'FAILED',
      understanding,
      gate_a: { proceeded: true },
      error: toolResult.error?.message ?? 'The place search failed.',
      note: 'Eden planned and attempted the search, but the tool failed. The failure is recorded in the audit trail.',
    };
  }

  const output = (toolResult.output ?? {}) as { results?: PlaceResult[] };
  const results = output.results ?? [];

  // T11: EXECUTING -> VERIFYING, then T14: VERIFYING -> COMPLETED.
  await memoryApi.transition(wp.id, 'VERIFYING', {
    trigger: 'All actions terminal-success',
    actor: 'orchestrator',
  });
  await memoryApi.transition(wp.id, 'COMPLETED', {
    trigger: 'Verify pass',
    actor: 'orchestrator',
  });

  const cuisineLabel = placeIntent.cuisine ? `${placeIntent.cuisine} ` : '';
  return {
    request_id: request.id,
    work_package_id: wp.id,
    status: 'COMPLETED',
    understanding,
    gate_a: { proceeded: true },
    results,
    note: `Eden ran the full loop and found ${results.length} ${cuisineLabel}place(s) near ${location}. The request, plan, tool call, and every state change are stored in the audit trail.`,
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
