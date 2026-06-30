/**
 * Eden — Orchestrator.
 *
 * Drives a Work Package through the deterministic loop (Build Spec §6.2):
 * UNDERSTAND → Gate A → PLAN → STATE WRITE → Gate B → EXECUTE → VERIFY →
 * COMMIT → RETURN, stopping at the next halt or terminal state. It coordinates
 * the other modules but performs none of their work itself: Reasoning decides,
 * Execution acts, Memory persists. The Orchestrator only sequences and is the
 * sole writer of `status` (Core Contract §2, Rule 10).
 *
 * Milestone 1 ships the interface and a loud stub. The real Orchestrator is
 * built incrementally across Phases 1–4 as each plane comes online.
 */

import { NotImplementedError } from '@/lib/errors';

export * from '@/core/orchestrator/types';

export interface Orchestrator {
  /** Pump the state machine to the next halt or terminal state. */
  drive(wpId: string): Promise<void>;
}

/** Placeholder Orchestrator for Milestone 1. */
export const orchestrator: Orchestrator = {
  drive() {
    throw new NotImplementedError('Orchestrator.drive', 'Orchestration milestone (Phases 1–4)');
  },
};
