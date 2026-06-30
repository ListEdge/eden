/**
 * Eden — Run endpoint.
 *
 * POST /api/eden/run  body: { "raw_request": "...", "conversation_id"?: "..." }
 *
 * Runs one conversation turn: Eden interprets the request in the context of the
 * ongoing conversation, then either finds places (driving the full read-only
 * loop) or replies conversationally. Returns the turn result, including the
 * conversation_id to send back on the next turn.
 *
 * Requires Supabase + a reasoning provider (OpenAI). Runs on the Node.js runtime.
 */

import { z } from 'zod';
import { withRoute, parseJsonBody } from '@/lib/http/handler';
import { jsonOk } from '@/lib/http/responses';
import { runConversationTurn } from '@/core/orchestrator';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const runRequestSchema = z
  .object({
    raw_request: z.string().min(1).optional(),
    input: z.string().min(1).optional(),
    conversation_id: z.string().uuid().optional(),
  })
  .refine((b) => Boolean(b.raw_request ?? b.input), {
    message: 'Provide a non-empty `raw_request` (or `input`).',
  });

export const POST = withRoute(async (request, { requestId }) => {
  const body = await parseJsonBody(request, runRequestSchema);
  const rawRequest = (body.raw_request ?? body.input)!;
  const result = await runConversationTurn(rawRequest, body.conversation_id);
  return jsonOk(result, requestId);
});
