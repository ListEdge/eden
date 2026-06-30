/**
 * Eden — Work Package state machine (the deterministic spine).
 *
 * The legal transition set is transcribed directly from Build Spec §4 (T1–T20).
 * The Orchestrator is the ONLY writer of status, and it may apply a transition
 * only if it appears here (Core Contract Rule 10: determinism over flexibility).
 *
 * This module is pure data + pure functions: safe to use anywhere, no I/O.
 */

import type { WpStatus } from '@/core/work-package/types';

/** The status every Work Package starts in (Build Spec T1). */
export const INITIAL_STATUS: WpStatus = 'RECEIVED';

export interface TransitionDef {
  /** Build Spec transition id, e.g. 'T3'. */
  id: string;
  from: WpStatus;
  to: WpStatus;
  /** Human-readable trigger from Build Spec §4. */
  trigger: string;
}

/**
 * Legal transitions (Build Spec §4). T1 (creation → RECEIVED) is omitted here
 * because it has no `from` state; use `INITIAL_STATUS` when opening a package.
 */
export const TRANSITIONS: readonly TransitionDef[] = [
  { id: 'T2', from: 'RECEIVED', to: 'SPECIFIED', trigger: 'Reasoning.understand' },
  { id: 'T3', from: 'SPECIFIED', to: 'PLANNED', trigger: 'Gate A pass -> Planner' },
  { id: 'T4', from: 'SPECIFIED', to: 'BLOCKED_ON_INPUT', trigger: 'Gate A fail' },
  { id: 'T5', from: 'BLOCKED_ON_INPUT', to: 'SPECIFIED', trigger: 'Clarification answered' },
  { id: 'T6', from: 'PLANNED', to: 'AWAITING_APPROVAL', trigger: 'Gate B (level 3)' },
  { id: 'T7', from: 'PLANNED', to: 'EXECUTING', trigger: 'Gate B (level 1 or 2)' },
  { id: 'T8', from: 'AWAITING_APPROVAL', to: 'APPROVED', trigger: 'Approval granted' },
  { id: 'T9', from: 'AWAITING_APPROVAL', to: 'CANCELLED', trigger: 'Rejected / token expired' },
  { id: 'T10', from: 'APPROVED', to: 'EXECUTING', trigger: 'Runner dequeues' },
  { id: 'T11', from: 'EXECUTING', to: 'VERIFYING', trigger: 'All actions terminal-success' },
  { id: 'T12', from: 'EXECUTING', to: 'FAILED', trigger: 'Action failed' },
  { id: 'T13', from: 'EXECUTING', to: 'BLOCKED_ON_TOOL', trigger: 'Tool unavailable' },
  { id: 'T14', from: 'VERIFYING', to: 'COMPLETED', trigger: 'Verify pass' },
  { id: 'T15', from: 'VERIFYING', to: 'FAILED', trigger: 'Verify fail' },
  { id: 'T16', from: 'FAILED', to: 'ROLLED_BACK', trigger: 'Rollback complete' },
  { id: 'T17', from: 'FAILED', to: 'ROLLBACK_FAILED', trigger: 'Rollback failed [Δ CONTRACT]' },
  { id: 'T18', from: 'BLOCKED_ON_TOOL', to: 'APPROVED', trigger: 'Tool re-enabled + resume' },
  { id: 'T19', from: 'BLOCKED_ON_INPUT', to: 'CANCELLED', trigger: 'Human cancel' },
  { id: 'T19', from: 'PLANNED', to: 'CANCELLED', trigger: 'Human cancel' },
  { id: 'T19', from: 'AWAITING_APPROVAL', to: 'CANCELLED', trigger: 'Human cancel' },
  { id: 'T20', from: 'EXECUTING', to: 'CANCELLED', trigger: 'Human cancel mid-run' },
] as const;

/** Statuses with no outgoing transitions. ROLLBACK_FAILED is a quarantine state. */
export const TERMINAL_STATUSES: ReadonlySet<WpStatus> = new Set<WpStatus>([
  'COMPLETED',
  'CANCELLED',
  'ROLLED_BACK',
  'ROLLBACK_FAILED',
]);

/** Recoverable halt states (await human input or tool availability). */
export const BLOCKED_STATUSES: ReadonlySet<WpStatus> = new Set<WpStatus>([
  'BLOCKED_ON_INPUT',
  'BLOCKED_ON_TOOL',
]);

const ADJACENCY: ReadonlyMap<WpStatus, ReadonlySet<WpStatus>> = (() => {
  const map = new Map<WpStatus, Set<WpStatus>>();
  for (const t of TRANSITIONS) {
    if (!map.has(t.from)) map.set(t.from, new Set());
    map.get(t.from)!.add(t.to);
  }
  return map;
})();

/** True iff `from -> to` is a legal transition (Build Spec §4). */
export function isLegalTransition(from: WpStatus, to: WpStatus): boolean {
  return ADJACENCY.get(from)?.has(to) ?? false;
}

/** All statuses reachable from `from` in one step. */
export function nextStatuses(from: WpStatus): WpStatus[] {
  return [...(ADJACENCY.get(from) ?? [])];
}

export function isTerminal(status: WpStatus): boolean {
  return TERMINAL_STATUSES.has(status);
}

export function isBlocked(status: WpStatus): boolean {
  return BLOCKED_STATUSES.has(status);
}
