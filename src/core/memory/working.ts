/**
 * Eden — Working Memory (active context state).
 *
 * Per-Work-Package context created when `Orchestrator.drive` begins and
 * checkpointed at every state transition — which is what makes crash recovery
 * and `BLOCKED_*` resume real. On a terminal state it is distilled (outcomes →
 * Structured + Semantic) then evicted. Postgres is authoritative; a hot copy
 * keyed `wm:{work_package_id}` may live in Redis for low-latency cycle reads
 * (Memory System §3). Tool credentials are NEVER held here, even transiently
 * (§4.5).
 *
 * Milestone 1 ships the interface and a loud stub.
 */

import { NotImplementedError } from '@/lib/errors';
import type { WorkingMemoryState } from '@/core/memory/types';

export interface WorkingMemory {
  /** Initialise context at the start of a drive run. */
  begin(wpId: string, requestId: string, initial: WorkingMemoryState): Promise<void>;
  /** Read current context (hot path). */
  read(wpId: string): Promise<WorkingMemoryState>;
  /** Durably checkpoint context for one cycle (one state transition). */
  checkpoint(wpId: string, state: WorkingMemoryState): Promise<void>;
  /** Distil outcomes into long-term memory, then evict (terminal state). */
  distilAndEvict(wpId: string): Promise<void>;
}

/** Placeholder Working Memory for Milestone 1. */
export const workingMemory: WorkingMemory = {
  begin() {
    throw new NotImplementedError('WorkingMemory.begin', 'Memory milestone (Phase 1)');
  },
  read() {
    throw new NotImplementedError('WorkingMemory.read', 'Memory milestone (Phase 1)');
  },
  checkpoint() {
    throw new NotImplementedError('WorkingMemory.checkpoint', 'Memory milestone (Phase 1)');
  },
  distilAndEvict() {
    throw new NotImplementedError('WorkingMemory.distilAndEvict', 'Memory milestone (Phase 4)');
  },
};
