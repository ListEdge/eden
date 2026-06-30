/**
 * Eden — Memory Plane types.
 *
 * Memory is the single source of truth, and it is append-only and explainable
 * (Core Contract §1, Rule 4). It has three layers (Memory System spec):
 *   • Structured — the system of record: versioned entities with mandatory
 *     provenance and a one-active-version-per-identity truth invariant.
 *   • Semantic   — knowledge/context chunks with vector embeddings, retrieved
 *     by a tunable relevance score.
 *   • Working    — per-Work-Package active context, checkpointed at every state
 *     transition and distilled + evicted on a terminal state.
 *
 * A hard rule cuts across all three: secrets, approval tokens, and unnecessary
 * PII are NEVER stored; a redaction-on-write pass runs before any insert
 * (Memory System §4.5).
 */

import type { WorkPackage, WpStatus } from '@/core/work-package/types';

/* ----- Structured layer ----- */

/** Entity kinds in the system of record (Memory System §1.1). */
export type EntityKind = 'project' | 'system' | 'task' | 'decision' | 'actor_profile';

/** Lifecycle of an entity version (Memory System §1.2). */
export type EntityStatus = 'active' | 'superseded' | 'archived' | 'retracted';

/**
 * One version of a structured entity. The truth invariant: exactly one `active`
 * version per `identity_key` per tenant (Memory System §1.2). `attributes` is
 * kind-specific (Memory System §1.3) and holds config *pointers*, never secrets.
 */
export interface MemoryEntity {
  id: string;
  tenant_id: string;
  kind: EntityKind;
  /** Stable identity across versions (e.g. 'project:lumoura'). */
  identity_key: string;
  version: number;
  status: EntityStatus;
  attributes: Record<string, unknown>;
  /** Mandatory provenance: where this fact came from. */
  source_ref: string;
  created_at: string;
}

/* ----- Semantic layer ----- */

/** A retrievable knowledge chunk with its embedding (Memory System §2.1). */
export interface MemoryChunk {
  id: string;
  tenant_id: string;
  content: string;
  /** Embedding vector; absent until embedded. */
  embedding?: number[];
  tags: string[];
  /** Entity identity_keys this chunk references. */
  entities: string[];
  importance: number;
  access_count: number;
  superseded_by: string | null;
  created_at: string;
}

/** A semantic search hit with its computed relevance (Memory System §2.4). */
export interface ChunkMatch {
  chunk: MemoryChunk;
  relevance: number;
  cos_sim: number;
}

/* ----- Working layer ----- */

/** Per-Work-Package active context (Memory System §3.2 `state` shape). */
export interface WorkingMemoryState {
  current_stage: WpStatus;
  active_understanding: Record<string, unknown>;
  active_plan_ref: string | null;
  structured_refs: string[];
  retrieved_chunks: Array<{ chunk_id: string; relevance: number }>;
  action_results: Record<string, unknown>;
  open_questions: string[];
  scratch: Record<string, unknown>;
}

/* ----- Memory API supporting types ----- */

/** Input to open a request record (Build Spec §3 `requests`). */
export interface NewRequest {
  tenant_id: string;
  principal_id: string;
  raw_text: string;
  channel?: string;
}

/**
 * Context supplied with a status transition so Memory can validate legality and
 * record the trigger + guard inputs (Build Spec `status_transitions`).
 */
export interface GuardContext {
  trigger: string;
  actor: string;
  guard_context?: Record<string, unknown>;
}

/** A Work Package returned with its full trace for inspection. */
export interface WorkPackageWithTrace {
  work_package: WorkPackage;
  events: unknown[];
  reasoning_refs: string[];
}

/* ----- Conversation memory ----- */

export type ConversationRole = 'user' | 'assistant';

/** One turn (message) in a conversation. */
export interface ConversationTurn {
  id: string;
  role: ConversationRole;
  content: string;
  data: Record<string, unknown>;
  created_at: string;
}

/** Options when appending a turn. */
export interface AppendTurnOptions {
  data?: Record<string, unknown>;
  workPackageId?: string;
}
