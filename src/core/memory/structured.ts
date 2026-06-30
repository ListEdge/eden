/**
 * Eden — Structured Memory (system of record).
 *
 * Versioned entities with mandatory provenance. The truth invariant — exactly
 * one `active` version per identity per tenant — is maintained on write:
 * superseding a fact creates a new version and marks the old one `superseded`,
 * never overwriting it (Memory System §1, Contract Rule 4).
 *
 * Milestone 1 ships the interface and a loud stub.
 */

import { NotImplementedError } from '@/lib/errors';
import type { EntityKind, MemoryEntity } from '@/core/memory/types';

export interface StructuredMemory {
  /** Fetch the single active version for an identity, if any. */
  getActive(tenantId: string, identityKey: string): Promise<MemoryEntity | null>;
  /** List active entities of a kind. */
  listActive(tenantId: string, kind: EntityKind): Promise<MemoryEntity[]>;
  /**
   * Write a new active version of an entity, superseding the prior active one.
   * Provenance (`source_ref`) is mandatory; payloads pass redaction-on-write
   * first (Memory System §4.5).
   */
  upsertVersion(
    entity: Omit<MemoryEntity, 'id' | 'version' | 'status' | 'created_at'>,
  ): Promise<MemoryEntity>;
}

/** Placeholder Structured Memory for Milestone 1. */
export const structuredMemory: StructuredMemory = {
  getActive() {
    throw new NotImplementedError('StructuredMemory.getActive', 'Memory milestone (Phase 0)');
  },
  listActive() {
    throw new NotImplementedError('StructuredMemory.listActive', 'Memory milestone (Phase 0)');
  },
  upsertVersion() {
    throw new NotImplementedError('StructuredMemory.upsertVersion', 'Memory milestone (Phase 0)');
  },
};
