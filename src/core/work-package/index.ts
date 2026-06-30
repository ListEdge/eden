/**
 * Eden — Work Package Engine.
 *
 * Public surface of the Work Package module. It bundles the pure foundation
 * helpers (creation, validation, fingerprint, transition legality) that are
 * safe to ship in Milestone 1, and declares the `WorkPackageEngine` interface
 * for the persistence-bound operations that arrive with the Memory Plane in a
 * later milestone.
 *
 * Plane: control-side. The engine constructs and validates the contract object
 * but does not itself persist (that is the Memory Plane) or change status (that
 * is the Orchestrator).
 */

import { NotImplementedError } from '@/lib/errors';
import {
  INITIAL_STATUS,
  isLegalTransition,
} from '@/core/work-package/status';
import {
  assertInvariants,
  workPackageSchema,
} from '@/core/work-package/schema';
import type {
  NewWorkPackageInput,
  WorkPackage,
  WpStatus,
} from '@/core/work-package/types';

export * from '@/core/work-package/types';
export * from '@/core/work-package/status';
export {
  workPackageSchema,
  validateInvariants,
  assertInvariants,
  computeScopeFingerprint,
  type InvariantIssue,
} from '@/core/work-package/schema';

/**
 * Build the initial in-memory Work Package at INGEST (Build Spec T1). This does
 * not persist anything — it produces the `RECEIVED` object that the Memory
 * Plane will write. Reasoning fills in spec/plan/actions on later stages.
 */
export function createInitialWorkPackage(
  id: string,
  input: NewWorkPackageInput,
  now: string = new Date().toISOString(),
): WorkPackage {
  return {
    id,
    version: 1,
    created_at: now,
    updated_at: now,
    intent: {
      raw_request: input.raw_request,
      interpreted_goal: input.interpreted_goal ?? '',
      out_of_scope: [],
    },
    spec: {
      constraints: [],
      assumptions: [],
      inputs_required: [],
      acceptance_criteria: [],
    },
    // Least privilege by default (Contract Rule 5); the Classifier may raise it.
    permission_level_required: 1,
    approval: {
      required: false,
      granted: false,
      approved_by: null,
      approval_token: null,
      approved_at: null,
    },
    plan: null,
    actions: [],
    outputs: [],
    dependencies: {
      depends_on_packages: [],
      blocks_packages: [],
      external: [],
    },
    rollback_plan: {
      strategy: 'per-action reversal in reverse order',
      irreversible_actions: [],
      steps: [],
      irreversible_acknowledged: false,
    },
    status: INITIAL_STATUS,
    status_history: [{ status: INITIAL_STATUS, at: now }],
  };
}

/** Validate structure (zod) then Contract §4 invariants. Throws on failure. */
export function validateWorkPackage(value: unknown): WorkPackage {
  const wp = workPackageSchema.parse(value);
  assertInvariants(wp);
  return wp;
}

/** Convenience: is this status transition legal for the given package? */
export function canTransition(wp: WorkPackage, to: WpStatus): boolean {
  return isLegalTransition(wp.status, to);
}

/**
 * Persistence- and orchestration-bound operations. Implemented in a later
 * milestone once the Memory Plane and Orchestrator exist; the interface is
 * fixed now so callers can depend on it. See Build Spec §6.2 (`MemoryAPI`,
 * `Orchestrator`) for how these are realised.
 */
export interface WorkPackageEngine {
  /** Open a new package from raw intent and persist it in `RECEIVED`. */
  open(input: NewWorkPackageInput): Promise<WorkPackage>;
  /** Load the current version of a package. */
  load(id: string): Promise<WorkPackage>;
  /**
   * Persist a re-planned package as a new version. Recomputes the scope
   * fingerprint, which auto-voids any prior approval (Contract Rule 11).
   */
  revise(id: string, next: WorkPackage): Promise<WorkPackage>;
}

/** Placeholder engine for Milestone 1. Every method fails loudly (Rule 7). */
export const workPackageEngine: WorkPackageEngine = {
  open() {
    throw new NotImplementedError('WorkPackageEngine.open', 'Reasoning + Memory milestone');
  },
  load() {
    throw new NotImplementedError('WorkPackageEngine.load', 'Memory milestone');
  },
  revise() {
    throw new NotImplementedError('WorkPackageEngine.revise', 'Planner milestone');
  },
};
