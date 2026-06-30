/**
 * Eden — Execution Plane.
 *
 * Interfaces for running an approved Work Package and verifying its outputs
 * (Build Spec §6.2). The engine executes actions in dependency order, makes
 * each call idempotent, and tolerates long-running actions (Build Spec R2/R9).
 * The Verifier checks machine acceptance criteria; judgment criteria are
 * deferred to the Reasoning Plane.
 *
 * Hard boundary: nothing here runs unless the package is approved and its scope
 * fingerprint still matches (Contract Rule 1, Build Spec R3). Execution never
 * decides or re-plans (Contract Rule 2).
 *
 * Milestone 1 ships interfaces + loud stubs; the real Execution Service is
 * Phase 3, deployed with isolated credentials (Build Spec §1.1, R7).
 */

import { NotImplementedError } from '@/lib/errors';
import type { RollbackOutcome } from '@/core/execution/types';

export * from '@/core/execution/types';

export interface ExecutionEngine {
  /** Run an approved package's actions in DAG order, idempotently. */
  execute(wpId: string): Promise<void>;
}

export interface RollbackEngine {
  /** Reverse succeeded actions in reverse order; quarantine on failure. */
  rollback(wpId: string): Promise<RollbackOutcome>;
}

export interface Verifier {
  /** Check the package's machine acceptance criteria. */
  verifyMachine(wpId: string): Promise<boolean>;
}

/** Placeholder Execution Plane for Milestone 1. */
export const executionEngine: ExecutionEngine = {
  execute() {
    throw new NotImplementedError('ExecutionEngine.execute', 'Execution milestone (Phase 3)');
  },
};

export const rollbackEngine: RollbackEngine = {
  rollback() {
    throw new NotImplementedError('RollbackEngine.rollback', 'Rollback milestone (Phase 4)');
  },
};

export const verifier: Verifier = {
  verifyMachine() {
    throw new NotImplementedError('Verifier.verifyMachine', 'Execution milestone (Phase 3)');
  },
};
