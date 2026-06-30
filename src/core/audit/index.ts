/**
 * Eden — Audit / Event Log.
 *
 * The query + append surface over the append-only log. In practice the Memory
 * API delegates its `appendEvent`/`recordTrace` here; this module is the home
 * of event semantics and read access for traces and dashboards. Writes are
 * append-only and reads never mutate (Core Contract Rule 4).
 *
 * Milestone 1 ships the interface and a loud stub; the store is built with the
 * Memory Plane in Phase 0.
 */

import { NotImplementedError } from '@/lib/errors';
import type { EventInput, TraceInput } from '@/core/audit/types';

export * from '@/core/audit/types';

/** A stored event as returned by queries (input + assigned ordering/time). */
export interface StoredEvent extends EventInput {
  seq: number;
  created_at: string;
}

export interface AuditLog {
  /** Append an event. Never updates or deletes. */
  appendEvent(e: EventInput): Promise<void>;
  /** Record a reasoning trace; returns its reasoning_ref. */
  recordTrace(t: TraceInput): Promise<string>;
  /** Read a package's events in global order (full reconstructable history). */
  queryEvents(workPackageId: string): Promise<StoredEvent[]>;
}

/** Placeholder Audit Log for Milestone 1. */
export const auditLog: AuditLog = {
  appendEvent() {
    throw new NotImplementedError('AuditLog.appendEvent', 'Memory milestone (Phase 0)');
  },
  recordTrace() {
    throw new NotImplementedError('AuditLog.recordTrace', 'Memory milestone (Phase 0)');
  },
  queryEvents() {
    throw new NotImplementedError('AuditLog.queryEvents', 'Memory milestone (Phase 0)');
  },
};
