/**
 * Eden — Streaming turn endpoint.
 *
 * POST /api/eden/stream — runs a turn and streams the result as newline-delimited
 * JSON (NDJSON). Plain conversation streams token-by-token; actions that need a
 * tool or structured output emit a `defer` event so the client finishes them via
 * /api/eden/run. On the final text, voice is synthesised (best-effort) and sent
 * in the closing event.
 *
 * Event shapes (one JSON object per line):
 *   {"type":"meta","conversation_id":"…","action":"chat"}
 *   {"type":"delta","text":"…"}                     (many)
 *   {"type":"final","reply":"…","audio_base64":…,"audio_content_type":…}
 *   {"type":"defer","conversation_id":"…"}          (action → use /run)
 *   {"type":"error","message":"…"}
 *
 * This route returns a raw stream (not the usual JSON envelope), so it does not
 * use withRoute. Runs on the Node.js runtime.
 */

import { runTurnStream } from '@/core/orchestrator';
import { getSpeechProvider } from '@/lib/speech';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const NDJSON_HEADERS = {
  'Content-Type': 'application/x-ndjson; charset=utf-8',
  'Cache-Control': 'no-cache, no-transform',
  'X-Accel-Buffering': 'no',
};

export async function POST(request: Request): Promise<Response> {
  let body: { raw_request?: unknown; input?: unknown; conversation_id?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    body = {};
  }
  const raw =
    typeof body.raw_request === 'string'
      ? body.raw_request
      : typeof body.input === 'string'
        ? body.input
        : '';
  const conversationId = typeof body.conversation_id === 'string' ? body.conversation_id : undefined;

  if (!raw.trim()) {
    return new Response(`${JSON.stringify({ type: 'error', message: 'Provide a non-empty raw_request.' })}\n`, {
      status: 400,
      headers: NDJSON_HEADERS,
    });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (obj: unknown) => controller.enqueue(encoder.encode(`${JSON.stringify(obj)}\n`));
      try {
        for await (const ev of runTurnStream(raw, conversationId)) {
          if (ev.type === 'final') {
            let audioB64: string | null = null;
            let audioType: string | null = null;
            if (ev.reply) {
              try {
                const provider = getSpeechProvider();
                const buf = await provider.synthesize(ev.reply);
                audioB64 = Buffer.from(buf).toString('base64');
                audioType = provider.contentType;
              } catch {
                // Voice is best-effort; the streamed text stands on its own.
              }
            }
            send({ ...ev, audio_base64: audioB64, audio_content_type: audioType });
          } else {
            send(ev);
          }
        }
      } catch {
        send({ type: 'error', message: 'Eden had trouble responding.' });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, { headers: NDJSON_HEADERS });
}
