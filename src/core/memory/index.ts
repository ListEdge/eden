/**
 * Eden — Memory Plane (the only path to state).
 *
 * `MemoryAPI` is the single façade the rest of the system uses to persist and
 * read state (Build Spec §6.2). It is the only writer of Work Packages and the
 * enforcer of their invariants on write; it transitions status only through the
 * legal set; and it appends events and reasoning traces (never updating or
 * deleting them — Contract Rule 4). The three storage layers (structured,
 * semantic, working) sit behind it and are re-exported here.
 *
 * Milestone 1 ships the interface, the layer interfaces, and loud stubs. The
 * concrete Memory Plane is Phase 0 — the first thing built, since every other
 * plane depends on it.
 */

import { NotImplementedError } from '@/lib/errors';
import { computeScopeFingerprint } from '@/core/work-package/schema';
import type { WorkPackage } from '@/core/work-package/types';
import type { RequestRecord, WorkPackageDraft } from '@/core/reasoning/types';
import type { EventInput, TraceInput } from '@/core/audit/types';
import type {
  GuardContext,
  NewRequest,
  WorkPackageWithTrace,
} from '@/core/memory/types';
import type { WpStatus } from '@/core/work-package/types';

export * from '@/core/memory/types';
export * from '@/core/memory/structured';
export * from '@/core/memory/semantic';
export * from '@/core/memory/working';

export interface MemoryAPI {
  /** Capture raw intent as an immutable request record (Stage 1 INGEST). */
  createRequest(input: NewRequest): Promise<RequestRecord>;
  /** Persist a planned draft as a real Work Package; enforces §4 invariants. */
  writeWorkPackage(wp: WorkPackageDraft): Promise<WorkPackage>;
  /** Apply a status transition if legal; records it in status_transitions. */
  transition(wpId: string, to: WpStatus, ctx: GuardContext): Promise<void>;
  /** Append an audit event. Never updates or deletes (Rule 4). */
  appendEvent(e: EventInput): Promise<void>;
  /** Record a reasoning trace; returns its reasoning_ref. */
  recordTrace(t: TraceInput): Promise<string>;
  /** Load a Work Package with its full trace. */
  getWorkPackage(wpId: string): Promise<WorkPackageWithTrace>;
  /** Scope fingerprint over approval-relevant fields (Build Spec R3). */
  computeFingerprint(wp: WorkPackage): string;
}

/**
 * Placeholder Memory Plane for Milestone 1. `computeFingerprint` is the one
 * method already wired to its real (pure) implementation — it has no I/O and is
 * needed wherever a package's approval scope is reasoned about.
 */
export const memoryApi: MemoryAPI = {
  createRequest() {
    throw new NotImplementedError('MemoryAPI.createRequest', 'Memory milestone (Phase 0)');
  },
  writeWorkPackage() {
    throw new NotImplementedError('MemoryAPI.writeWorkPackage', 'Memory milestone (Phase 0)');
  },
  transition() {
    throw new NotImplementedError('MemoryAPI.transition', 'Memory milestone (Phase 0)');
  },
  appendEvent() {
    throw new NotImplementedError('MemoryAPI.appendEvent', 'Memory milestone (Phase 0)');
  },
  recordTrace() {
    throw new NotImplementedError('MemoryAPI.recordTrace', 'Memory milestone (Phase 0)');
  },
  getWorkPackage() {
    throw new NotImplementedError('MemoryAPI.getWorkPackage', 'Memory milestone (Phase 0)');
  },
  computeFingerprint(wp: WorkPackage): string {
    return computeScopeFingerprint(wp);
  },
};
