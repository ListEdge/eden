/**
 * Eden — Semantic Memory (knowledge / context layer).
 *
 * Embedded knowledge chunks retrieved by a tunable relevance score that blends
 * cosine similarity with recency, importance, frequency, and entity overlap,
 * subject to a hard similarity floor so nothing is recalled on recency alone
 * (Memory System §2.4). Content passes redaction-on-write before embedding
 * (§4.5).
 *
 * Milestone 1 ships the interface and a loud stub. The default scoring weights
 * are surfaced as config so they are tunable without code changes (§2.4).
 */

import { NotImplementedError } from '@/lib/errors';
import type { ChunkMatch, MemoryChunk } from '@/core/memory/types';

/** Relevance weights + thresholds. Defaults from Memory System §2.4. */
export interface RelevanceConfig {
  w_s: number;
  w_r: number;
  w_i: number;
  w_f: number;
  w_e: number;
  /** Recency half-life in days. */
  tau_days: number;
  acceptThreshold: number;
  cosSimFloor: number;
}

export const DEFAULT_RELEVANCE: RelevanceConfig = {
  w_s: 0.45,
  w_r: 0.2,
  w_i: 0.2,
  w_f: 0.05,
  w_e: 0.1,
  tau_days: 14,
  acceptThreshold: 0.55,
  cosSimFloor: 0.3,
};

export interface RetrieveQuery {
  tenantId: string;
  text: string;
  /** Active Working-Memory entity refs, used for the entity-overlap term. */
  activeEntities?: string[];
  /** Restrict to chunks carrying any of these tags. */
  tags?: string[];
  limit?: number;
}

export interface SemanticMemory {
  /** Embed + store a chunk (after redaction). Returns the stored chunk. */
  store(
    chunk: Omit<
      MemoryChunk,
      'id' | 'embedding' | 'access_count' | 'superseded_by' | 'created_at'
    >,
  ): Promise<MemoryChunk>;
  /** Filter then rank by relevance; returns accepted matches only. */
  retrieve(query: RetrieveQuery, config?: RelevanceConfig): Promise<ChunkMatch[]>;
}

/** Placeholder Semantic Memory for Milestone 1. */
export const semanticMemory: SemanticMemory = {
  store() {
    throw new NotImplementedError('SemanticMemory.store', 'Memory milestone (Phase 1)');
  },
  retrieve() {
    throw new NotImplementedError('SemanticMemory.retrieve', 'Memory milestone (Phase 1)');
  },
};
