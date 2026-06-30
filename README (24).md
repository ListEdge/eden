/**
 * Eden — Orchestrator types.
 *
 * The Orchestrator pumps a Work Package through the fixed lifecycle until it
 * reaches the next halt point or a terminal state (Core Contract §2). It is the
 * single writer of `status` — no other component transitions a package — which
 * is what keeps the state machine deterministic and auditable (Contract Rule 10).
 */

import type { WpStatus } from '@/core/work-package/types';

/** Where a drive run came to rest, and why. */
export interface DriveResult {
  work_package_id: string;
  status: WpStatus;
  /** True if execution paused at a halt point (Gate A/B, tool, input). */
  halted: boolean;
  /** Short machine reason, e.g. 'AWAITING_APPROVAL', 'BLOCKED_ON_INPUT', 'COMPLETED'. */
  reason: string;
}

/** Ambient context for a drive run (tenancy + the acting principal). */
export interface OrchestratorContext {
  tenantId: string;
  principalId: string;
}
