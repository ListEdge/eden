/**
 * Eden — Audit / Event Log types.
 *
 * The append-only spine of traceability (Core Contract Rule 4, Rule 9). Every
 * state transition, tool call, approval, and failure is an event; every model
 * decision is a reasoning trace. These records are written once and never
 * mutated — the database revokes UPDATE/DELETE for the app role (Build Spec
 * §3.1). A package that cannot account for itself in this log must not run.
 */

/** Event categories written to the log (Build Spec §3 `events.type`). */
export type EventType =
  | 'STATE_TRANSITION'
  | 'TOOL_CALL'
  | 'APPROVAL_REQUESTED'
  | 'APPROVAL_GRANTED'
  | 'APPROVAL_REJECTED'
  | 'CLARIFICATION_RAISED'
  | 'CLARIFICATION_ANSWERED'
  | 'ROLLBACK'
  | 'ESCALATION'
  | 'ERROR';

/** An event to append. `seq` is assigned by the store, giving a global order. */
export interface EventInput {
  tenant_id: string;
  work_package_id?: string;
  action_id?: string;
  type: EventType;
  payload?: Record<string, unknown>;
  /** Link to the reasoning trace that motivated this event, if any. */
  reasoning_ref?: string;
  /** Module name or principal id that caused the event. */
  actor: string;
}

/** Reasoning-stage labels recorded with a trace (Build Spec `reasoning_traces`). */
export type ReasoningStage = 'UNDERSTAND' | 'GATE_A' | 'PLAN' | 'CLASSIFY' | 'VERIFY';

/** A model decision to record. Returns a `reasoning_ref` once stored. */
export interface TraceInput {
  work_package_id?: string;
  stage: ReasoningStage;
  model: string;
  /** Hash of the prompt, not the prompt itself (avoids storing sensitive input). */
  prompt_hash: string;
  input: Record<string, unknown>;
  output: Record<string, unknown>;
  rationale?: string;
}
