/**
 * Eden — Orchestrator.
 *
 * Sequences a Work Package through the lifecycle. It coordinates the other
 * modules but performs none of their work itself: Reasoning decides, Execution
 * acts, Memory persists. Crucially, the Orchestrator is the ONLY component that
 * asks Memory to change a Work Package's status (Core Contract §2, Rule 10).
 *
 * Milestone 2 implements `runReadOnlyIntake` — the safe front of the loop for
 * read-only work: ingest → understand → specify → Gate A. It stops at SPECIFIED
 * (planning is a later milestone) or, if the request is ambiguous, halts at
 * BLOCKED_ON_INPUT with clarifying questions. The full durable `drive` loop is
 * built out across later phases.
 */

import { createHash } from 'node:crypto';
import { NotImplementedError } from '@/lib/errors';
import { getReasoningProvider } from '@/lib/ai/registry';
import { SYSTEM_PRINCIPAL_ID, SYSTEM_TENANT_ID } from '@/lib/config/constants';
import { memoryApi } from '@/core/memory';
import { reasoningPlane, type Question, type Understanding } from '@/core/reasoning';
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
    // T4: SPECIFIED -> BLOCKED_ON_INPUT.
    await memoryApi.transition(wp.id, 'BLOCKED_ON_INPUT', {
      trigger: 'Gate A fail',
      actor: 'orchestrator',
      guard_context: { question_count: gate.questions?.length ?? 0 },
    });
    await memoryApi.appendEvent({
      tenant_id: tenantId,
      work_package_id: wp.id,
      type: 'CLARIFICATION_RAISED',
      payload: { questions: gate.questions ?? [] },
      actor: 'orchestrator',
    });
    return {
      request_id: request.id,
      work_package_id: wp.id,
      status: 'BLOCKED_ON_INPUT',
      understanding,
      gate_a: { proceeded: false, questions: gate.questions },
      note: 'Eden halted at Gate A: the request needs clarification before it can be planned. Answering these questions will resume it (the clarification-resume loop lands in a later milestone).',
    };
  }

  return {
    request_id: request.id,
    work_package_id: wp.id,
    status: 'SPECIFIED',
    understanding,
    gate_a: { proceeded: true },
    note: 'Eden understood the request and it passed Gate A. The next stage (planning) is implemented in a later milestone; the Work Package is parked at SPECIFIED with its full interpretation and audit trail stored.',
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
