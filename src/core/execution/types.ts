/**
 * Eden — Execution Plane types.
 *
 * The Execution Plane does *what it was told*, exactly. It is the only plane
 * that holds tool credentials and the only plane that touches the outside world
 * (Core Contract §1). It never decides, re-plans, or improvises.
 */

/** Result of a single tool invocation (run or rollback). */
export interface ToolResult {
  ok: boolean;
  /** Structured, tool-specific output (e.g. a deployment URL). */
  output?: unknown;
  /** Present when `ok` is false. */
  error?: { message: string; details?: Record<string, unknown> };
  /** Free-form provider metadata (timings, ids) for the execution log. */
  meta?: Record<string, unknown>;
}

/** Per-action outcome of a rollback pass. */
export interface RollbackStepOutcome {
  action_id: string;
  status: 'DONE' | 'FAILED' | 'SKIPPED';
  detail?: string;
}

/**
 * Result of rolling back a Work Package. If any step fails, the package is
 * quarantined in `ROLLBACK_FAILED` and a human is escalated (Build Spec R4/T17).
 */
export interface RollbackOutcome {
  /** True only if every required step completed. */
  complete: boolean;
  steps: RollbackStepOutcome[];
}

/**
 * Ambient context passed to execution. `idempotencyKeyFor` yields the per-action
 * key the runner uses to make re-issued calls crash-safe (Build Spec Risk R2).
 */
export interface ExecutionContext {
  workPackageId: string;
  tenantId: string;
  idempotencyKeyFor(actionId: string): string;
}
