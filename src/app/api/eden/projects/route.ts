/**
 * Eden — Projects endpoint.
 *
 *   GET  /api/eden/projects          → list projects (most-recent first)
 *   GET  /api/eden/projects?id=<id>  → one project (with its saved plan) + its
 *                                       recent conversation turns for display
 *   POST /api/eden/projects          → create a project. Body:
 *        { title?, summary?, plan?, conversation_id? }. When no conversation_id
 *        is given, a fresh conversation (thread) is opened for the project.
 *
 * A project wraps a conversation, so resuming it continues Eden's memory of that
 * work. Requires Supabase. Runs on the Node.js runtime.
 */

import { z } from 'zod';
import { withRoute, parseJsonBody } from '@/lib/http/handler';
import { jsonOk } from '@/lib/http/responses';
import { memoryApi, type Project, type ProjectDetail } from '@/core/memory';
import { SYSTEM_PRINCIPAL_ID, SYSTEM_TENANT_ID } from '@/lib/config/constants';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const TENANT = SYSTEM_TENANT_ID;
const PRINCIPAL = SYSTEM_PRINCIPAL_ID;

/** The two shapes GET can return. */
type ProjectsGet =
  | { projects: Project[] }
  | { project: ProjectDetail | null; turns: { role: 'user' | 'eden'; text: string }[] };

const createSchema = z.object({
  title: z.string().trim().min(1).optional(),
  summary: z.string().optional(),
  plan: z.unknown().optional(),
  conversation_id: z.string().uuid().optional(),
});

export const GET = withRoute(async (request, { requestId }) => {
  const id = new URL(request.url).searchParams.get('id');

  if (id) {
    const project = await memoryApi.getProject(id);
    if (!project) {
      return jsonOk<ProjectsGet>({ project: null, turns: [] }, requestId);
    }
    const turns = project.conversation_id
      ? (await memoryApi.getRecentTurns(project.conversation_id, 30)).map((t) => ({
          role: (t.role === 'assistant' ? 'eden' : 'user') as 'user' | 'eden',
          text: t.content,
        }))
      : [];
    return jsonOk<ProjectsGet>({ project, turns }, requestId);
  }

  const projects = await memoryApi.listProjects(TENANT, 50);
  return jsonOk<ProjectsGet>({ projects }, requestId);
});

export const POST = withRoute(async (request, { requestId }) => {
  const body = await parseJsonBody(request, createSchema);

  const planObj = (body.plan ?? null) as { title?: unknown; concept?: unknown } | null;
  const planTitle = planObj && typeof planObj.title === 'string' ? planObj.title : '';
  const planConcept = planObj && typeof planObj.concept === 'string' ? planObj.concept : '';

  const title = body.title || planTitle || 'New project';
  const summary = body.summary ?? planConcept ?? '';
  const conversationId =
    body.conversation_id ?? (await memoryApi.createConversation(TENANT, PRINCIPAL));

  const project = await memoryApi.createProject({
    tenantId: TENANT,
    principalId: PRINCIPAL,
    title,
    summary,
    conversationId,
    plan: body.plan ?? null,
  });

  return jsonOk({ project }, requestId, 201);
});
