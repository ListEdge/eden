/**
 * Eden — Memory Plane (the only path to state).
 *
 * `MemoryAPI` is the single façade the rest of the system uses to persist and
 * read state (Build Spec §6.2). It is the only writer of Work Packages and the
 * only thing that transitions status (through the legal set); it appends events
 * and reasoning traces and never updates or deletes them (Contract Rule 4). The
 * three storage layers (structured, semantic, working) sit behind it and are
 * re-exported here.
 *
 * Milestone 2 implements the read-only intake path against Supabase: open a
 * request, open a Work Package, save its specification, transition its status,
 * append events, and record reasoning traces — all through the service-role
 * (admin) client, since authentication and per-tenant row-level-security
 * policies arrive in a later milestone. The planning-time `writeWorkPackage`
 * and the trace-returning `getWorkPackage` remain stubbed until then.
 */

import {
  ConfigurationError,
  EdenError,
  IllegalTransitionError,
  NotImplementedError,
} from '@/lib/errors';
import { getSupabaseAdminClient } from '@/lib/supabase/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { computeScopeFingerprint } from '@/core/work-package/schema';
import { createInitialWorkPackage } from '@/core/work-package';
import { isLegalTransition } from '@/core/work-package/status';
import type {
  NewWorkPackageInput,
  WorkPackage,
  WorkPackageIntent,
  WorkPackageSpec,
  WpStatus,
} from '@/core/work-package/types';
import type { RequestRecord, WorkPackageDraft } from '@/core/reasoning/types';
import type { EventInput, TraceInput } from '@/core/audit/types';
import type {
  AppendTurnOptions,
  ConversationRole,
  ConversationTurn,
  GuardContext,
  NewRequest,
  WorkPackageWithTrace,
} from '@/core/memory/types';

export * from '@/core/memory/types';
export * from '@/core/memory/structured';
export * from '@/core/memory/semantic';
export * from '@/core/memory/working';

/** Context needed to open a Work Package row (tenancy + provenance). */
export interface OpenWorkPackageContext {
  tenantId: string;
  requestId: string;
  principalId: string;
}

/** The specification fields written when a package becomes SPECIFIED. */
export interface SpecificationUpdate {
  intent: WorkPackageIntent;
  spec: WorkPackageSpec;
}

/** A persistent project workspace (list view — no plan payload). */
export interface Project {
  id: string;
  title: string;
  summary: string;
  status: string;
  conversation_id: string | null;
  has_plan: boolean;
  created_at: string;
  updated_at: string;
}

/** A project with its saved plan payload (detail view). */
export interface ProjectDetail extends Project {
  plan: unknown | null;
}

/** Input to create a project. */
export interface NewProject {
  tenantId: string;
  principalId: string;
  title: string;
  summary?: string;
  status?: string;
  conversationId?: string | null;
  plan?: unknown | null;
}

export interface MemoryAPI {
  /** Capture raw intent as an immutable request record (Stage 1 INGEST). */
  createRequest(input: NewRequest): Promise<RequestRecord>;
  /** Open a new Work Package at RECEIVED and persist it (Build Spec T1). */
  openWorkPackage(input: NewWorkPackageInput, ctx: OpenWorkPackageContext): Promise<WorkPackage>;
  /** Persist the interpreted intent + spec produced by UNDERSTAND. */
  saveSpecification(wpId: string, update: SpecificationUpdate): Promise<void>;
  /** Persist a planned draft as a real Work Package; enforces §4 invariants. */
  writeWorkPackage(wp: WorkPackageDraft): Promise<WorkPackage>;
  /** Apply a status transition if legal; records it and emits an event. */
  transition(wpId: string, to: WpStatus, ctx: GuardContext): Promise<void>;
  /** Append an audit event. Never updates or deletes (Rule 4). */
  appendEvent(e: EventInput): Promise<void>;
  /** Record a reasoning trace; returns its reasoning_ref. */
  recordTrace(t: TraceInput): Promise<string>;
  /** Load a Work Package with its full trace. */
  getWorkPackage(wpId: string): Promise<WorkPackageWithTrace>;
  /** Scope fingerprint over approval-relevant fields (Build Spec R3). */
  computeFingerprint(wp: WorkPackage): string;

  /** Open a new conversation; returns its id. */
  createConversation(tenantId: string, principalId: string): Promise<string>;
  /** Append one turn (message) to a conversation. Append-only. */
  appendTurn(
    conversationId: string,
    tenantId: string,
    role: ConversationRole,
    content: string,
    opts?: AppendTurnOptions,
  ): Promise<void>;
  /** Load the most recent turns of a conversation, oldest-first. */
  getRecentTurns(conversationId: string, limit?: number): Promise<ConversationTurn[]>;

  /** Create a persistent project workspace. */
  createProject(input: NewProject): Promise<Project>;
  /** List projects for a tenant, most-recently-updated first. */
  listProjects(tenantId: string, limit?: number): Promise<Project[]>;
  /** Load a single project (including its saved plan), or null if not found. */
  getProject(id: string): Promise<ProjectDetail | null>;
}

/**
 * The service-role client for system writes. Cast to an untyped client because
 * the placeholder `Database` schema resolves table types to `never`; once the
 * schema is live and types are regenerated (see src/lib/supabase/types.ts),
 * this cast can be dropped and queries become fully typed.
 */
function adminDb(): SupabaseClient {
  return getSupabaseAdminClient() as unknown as SupabaseClient;
}

/** Normalise a Supabase error into an EdenError without leaking internals. */
function dbError(op: string, error: unknown): EdenError {
  const message =
    error && typeof error === 'object' && 'message' in error
      ? String((error as { message: unknown }).message)
      : 'unknown database error';
  return new EdenError('INTERNAL', `Memory operation failed (${op}): ${message}`, {
    cause: error,
  });
}

/** Resolve the tenant that owns a Work Package (used when context omits it). */
async function tenantOf(wpId: string): Promise<string> {
  const db = adminDb();
  const { data, error } = await db
    .from('work_packages')
    .select('tenant_id')
    .eq('id', wpId)
    .single();
  if (error || !data) throw dbError('resolve tenant', error);
  return data.tenant_id as string;
}

export const memoryApi: MemoryAPI = {
  async createRequest(input: NewRequest): Promise<RequestRecord> {
    const db = adminDb();
    const { data, error } = await db
      .from('requests')
      .insert({
        tenant_id: input.tenant_id,
        principal_id: input.principal_id,
        raw_text: input.raw_text,
        channel: input.channel ?? 'api',
      })
      .select('id, tenant_id, principal_id, raw_text, received_at')
      .single();
    if (error || !data) throw dbError('createRequest', error);
    return {
      id: data.id as string,
      tenant_id: data.tenant_id as string,
      principal_id: data.principal_id as string,
      raw_text: data.raw_text as string,
      received_at: data.received_at as string,
    };
  },

  async openWorkPackage(
    input: NewWorkPackageInput,
    ctx: OpenWorkPackageContext,
  ): Promise<WorkPackage> {
    const db = adminDb();
    const wpId = crypto.randomUUID();
    const now = new Date().toISOString();
    const wp = createInitialWorkPackage(wpId, input, now);

    const { error } = await db.from('work_packages').insert({
      id: wpId,
      tenant_id: ctx.tenantId,
      request_id: ctx.requestId,
      version: wp.version,
      status: wp.status,
      permission_level: wp.permission_level_required,
      intent: wp.intent,
      spec: wp.spec,
      plan: wp.plan,
      irreversible_acknowledged: wp.rollback_plan.irreversible_acknowledged,
      created_at: now,
      updated_at: now,
    });
    if (error) throw dbError('openWorkPackage', error);

    // Creation is the entry at RECEIVED, not a transition — record it as an event.
    await this.appendEvent({
      tenant_id: ctx.tenantId,
      work_package_id: wpId,
      type: 'STATE_TRANSITION',
      payload: { to: wp.status, creation: true },
      actor: 'memory',
    });
    return wp;
  },

  async saveSpecification(wpId: string, update: SpecificationUpdate): Promise<void> {
    const db = adminDb();
    const { error } = await db
      .from('work_packages')
      .update({
        intent: update.intent,
        spec: update.spec,
        updated_at: new Date().toISOString(),
      })
      .eq('id', wpId);
    if (error) throw dbError('saveSpecification', error);
  },

  async transition(wpId: string, to: WpStatus, ctx: GuardContext): Promise<void> {
    const db = adminDb();
    const { data: row, error: readErr } = await db
      .from('work_packages')
      .select('status, tenant_id')
      .eq('id', wpId)
      .single();
    if (readErr || !row) throw dbError('transition.load', readErr);

    const from = row.status as WpStatus;
    const tenantId = row.tenant_id as string;
    if (!isLegalTransition(from, to)) {
      throw new IllegalTransitionError(from, to);
    }

    const now = new Date().toISOString();
    const { error: updErr } = await db
      .from('work_packages')
      .update({ status: to, updated_at: now })
      .eq('id', wpId);
    if (updErr) throw dbError('transition.update', updErr);

    const { error: stErr } = await db.from('status_transitions').insert({
      tenant_id: tenantId,
      work_package_id: wpId,
      from_status: from,
      to_status: to,
      trigger: ctx.trigger,
      actor: ctx.actor,
      guard_context: ctx.guard_context ?? {},
    });
    if (stErr) throw dbError('transition.record', stErr);

    await this.appendEvent({
      tenant_id: tenantId,
      work_package_id: wpId,
      type: 'STATE_TRANSITION',
      payload: { from, to, trigger: ctx.trigger },
      actor: ctx.actor,
    });
  },

  async appendEvent(e: EventInput): Promise<void> {
    const db = adminDb();
    const { error } = await db.from('events').insert({
      tenant_id: e.tenant_id,
      work_package_id: e.work_package_id ?? null,
      action_id: e.action_id ?? null,
      type: e.type,
      payload: e.payload ?? {},
      reasoning_ref: e.reasoning_ref ?? null,
      actor: e.actor,
    });
    if (error) throw dbError('appendEvent', error);
  },

  async recordTrace(t: TraceInput): Promise<string> {
    if (!t.work_package_id) {
      throw new ConfigurationError('recordTrace requires a work_package_id to resolve tenant');
    }
    const db = adminDb();
    const tenantId = await tenantOf(t.work_package_id);
    const { data, error } = await db
      .from('reasoning_traces')
      .insert({
        tenant_id: tenantId,
        work_package_id: t.work_package_id,
        stage: t.stage,
        model: t.model,
        prompt_hash: t.prompt_hash,
        input: t.input,
        output: t.output,
        rationale: t.rationale ?? null,
      })
      .select('id')
      .single();
    if (error || !data) throw dbError('recordTrace', error);
    return data.id as string;
  },

  getWorkPackage(): Promise<WorkPackageWithTrace> {
    throw new NotImplementedError('MemoryAPI.getWorkPackage', 'Read API milestone');
  },

  writeWorkPackage(): Promise<WorkPackage> {
    throw new NotImplementedError('MemoryAPI.writeWorkPackage', 'Planner milestone (Phase 2)');
  },

  computeFingerprint(wp: WorkPackage): string {
    return computeScopeFingerprint(wp);
  },

  async createConversation(tenantId: string, principalId: string): Promise<string> {
    const db = adminDb();
    const { data, error } = await db
      .from('conversations')
      .insert({ tenant_id: tenantId, principal_id: principalId })
      .select('id')
      .single();
    if (error || !data) throw dbError('createConversation', error);
    return data.id as string;
  },

  async appendTurn(
    conversationId: string,
    tenantId: string,
    role: ConversationRole,
    content: string,
    opts?: AppendTurnOptions,
  ): Promise<void> {
    const db = adminDb();
    const { error } = await db.from('conversation_turns').insert({
      conversation_id: conversationId,
      tenant_id: tenantId,
      role,
      content,
      data: opts?.data ?? {},
      work_package_id: opts?.workPackageId ?? null,
    });
    if (error) throw dbError('appendTurn', error);
  },

  async getRecentTurns(conversationId: string, limit = 8): Promise<ConversationTurn[]> {
    const db = adminDb();
    // Newest first for the limit, then reverse to chronological.
    const { data, error } = await db
      .from('conversation_turns')
      .select('id, role, content, data, created_at')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) throw dbError('getRecentTurns', error);
    const rows = Array.isArray(data) ? data : [];
    return rows
      .map((r) => ({
        id: r.id as string,
        role: r.role as ConversationRole,
        content: r.content as string,
        data: (r.data as Record<string, unknown>) ?? {},
        created_at: r.created_at as string,
      }))
      .reverse();
  },

  async createProject(input: NewProject): Promise<Project> {
    const db = adminDb();
    const now = new Date().toISOString();
    const { data, error } = await db
      .from('projects')
      .insert({
        tenant_id: input.tenantId,
        principal_id: input.principalId,
        conversation_id: input.conversationId ?? null,
        title: input.title,
        summary: input.summary ?? '',
        status: input.status ?? 'active',
        plan: input.plan ?? null,
        created_at: now,
        updated_at: now,
      })
      .select('id, title, summary, status, conversation_id, plan, created_at, updated_at')
      .single();
    if (error || !data) throw dbError('createProject', error);
    return {
      id: data.id as string,
      title: data.title as string,
      summary: (data.summary as string) ?? '',
      status: data.status as string,
      conversation_id: (data.conversation_id as string | null) ?? null,
      has_plan: data.plan != null,
      created_at: data.created_at as string,
      updated_at: data.updated_at as string,
    };
  },

  async listProjects(tenantId: string, limit = 50): Promise<Project[]> {
    const db = adminDb();
    const { data, error } = await db
      .from('projects')
      .select('id, title, summary, status, conversation_id, plan, created_at, updated_at')
      .eq('tenant_id', tenantId)
      .order('updated_at', { ascending: false })
      .limit(limit);
    if (error) throw dbError('listProjects', error);
    const rows = Array.isArray(data) ? data : [];
    return rows.map((r) => ({
      id: r.id as string,
      title: r.title as string,
      summary: (r.summary as string) ?? '',
      status: r.status as string,
      conversation_id: (r.conversation_id as string | null) ?? null,
      has_plan: r.plan != null,
      created_at: r.created_at as string,
      updated_at: r.updated_at as string,
    }));
  },

  async getProject(id: string): Promise<ProjectDetail | null> {
    const db = adminDb();
    const { data, error } = await db
      .from('projects')
      .select('id, title, summary, status, conversation_id, plan, created_at, updated_at')
      .eq('id', id)
      .maybeSingle();
    if (error) throw dbError('getProject', error);
    if (!data) return null;
    return {
      id: data.id as string,
      title: data.title as string,
      summary: (data.summary as string) ?? '',
      status: data.status as string,
      conversation_id: (data.conversation_id as string | null) ?? null,
      has_plan: data.plan != null,
      plan: (data.plan as unknown) ?? null,
      created_at: data.created_at as string,
      updated_at: data.updated_at as string,
    };
  },
};
