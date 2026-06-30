/**
 * Eden — Speak endpoint.
 *
 * POST /api/eden/speak  body: { "text": "..." }
 * Returns spoken audio (audio/mpeg) for the given text via the configured speech
 * provider (ElevenLabs by default). The provider key stays on the server; the
 * browser only ever receives audio. Errors come back as the standard JSON
 * envelope so the client can show a message.
 *
 * Runs on the Node.js runtime.
 */

import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { jsonError } from '@/lib/http/responses';
import { toEdenError } from '@/lib/errors';
import { getSpeechProvider } from '@/lib/speech';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const schema = z.object({ text: z.string().min(1).max(5000) });

export async function POST(request: Request): Promise<Response> {
  const requestId = randomUUID();

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return jsonError({ code: 'VALIDATION', message: 'Request body must be JSON.' }, requestId, 400);
  }

  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    return jsonError(
      { code: 'VALIDATION', message: parsed.error.issues[0]?.message ?? 'Invalid body.' },
      requestId,
      400,
    );
  }

  try {
    const provider = getSpeechProvider();
    const audio = await provider.synthesize(parsed.data.text);
    return new Response(audio, {
      status: 200,
      headers: {
        'Content-Type': provider.contentType,
        'Cache-Control': 'no-store',
        'X-Request-Id': requestId,
      },
    });
  } catch (error) {
    const err = toEdenError(error);
    const status = err.code === 'CONFIGURATION' ? 503 : 502;
    return jsonError({ code: err.code, message: err.message }, requestId, status);
  }
}
