/**
 * Eden — Run endpoint.
 *
 * POST /api/eden/run  body: { "raw_request": "...", "conversation_id"?: "..." }
 *
 * Runs one conversation turn AND generates the spoken audio in the same request,
 * so the browser makes a single round trip and the server only wakes once per
 * turn. Returns the turn result plus base64 audio (when voice succeeds); voice is
 * best-effort — if it fails, the text reply still stands.
 *
 * Requires Supabase + a reasoning provider (OpenAI). Runs on the Node.js runtime.
 */

import { z } from 'zod';
import { withRoute, parseJsonBody } from '@/lib/http/handler';
import { jsonOk } from '@/lib/http/responses';
import { runConversationTurn } from '@/core/orchestrator';
import { getSpeechProvider } from '@/lib/speech';

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

  // Generate speech in the same request (best-effort; voice is optional).
  let audio_base64: string | null = null;
  let audio_content_type: string | null = null;
  if (result.reply) {
    try {
      const provider = getSpeechProvider();
      const buf = await provider.synthesize(result.reply);
      audio_base64 = Buffer.from(buf).toString('base64');
      audio_content_type = provider.contentType;
    } catch {
      // Voice failed — the on-screen reply is still returned.
    }
  }

  return jsonOk({ ...result, audio_base64, audio_content_type }, requestId);
});
