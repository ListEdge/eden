/**
 * Eden — Briefing endpoint.
 *
 * POST /api/eden/brief — Eden's wake greeting. Produces a short briefing of the
 * user's world (their projects) and speaks it, in one round trip. Voice is
 * best-effort; the text stands on its own if speech fails.
 *
 * Requires Supabase + a reasoning provider (OpenAI). Runs on the Node.js runtime.
 */

import { withRoute } from '@/lib/http/handler';
import { jsonOk } from '@/lib/http/responses';
import { runBriefing } from '@/core/orchestrator';
import { getSpeechProvider } from '@/lib/speech';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export const POST = withRoute(async (request, { requestId }) => {
  const body = (await request.json().catch(() => ({}))) as { part_of_day?: unknown };
  const partOfDay = typeof body.part_of_day === 'string' ? body.part_of_day : undefined;
  const { reply, projects } = await runBriefing(partOfDay);

  let audio_base64: string | null = null;
  let audio_content_type: string | null = null;
  if (reply) {
    try {
      const provider = getSpeechProvider();
      const buf = await provider.synthesize(reply);
      audio_base64 = Buffer.from(buf).toString('base64');
      audio_content_type = provider.contentType;
    } catch {
      // Voice failed — the on-screen briefing still stands.
    }
  }

  return jsonOk({ reply, projects, audio_base64, audio_content_type }, requestId);
});
