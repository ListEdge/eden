/**
 * Eden — Run endpoint.
 *
 * POST /api/eden/run — the single entry point for human intent. It captures the
 * request, interprets it (a real reasoning call), stores the interpretation with
 * a full audit trail, and runs Gate A. It then either parks the Work Package at
 * SPECIFIED (understood; planning is a later milestone) or halts at
 * BLOCKED_ON_INPUT with clarifying questions when the request is ambiguous.
 *
 * This path requires Supabase (database) and a reasoning provider (OpenAI) to be
 * configured; without them it returns a clear configuration error rather than
 * guessing. It runs on the Node.js runtime (hashing + provider SDK).
 */

import { z } from 'zod';
import { withRoute, parseJsonBody } from '@/lib/http/handler';
import { jsonOk } from '@/lib/http/responses';
import { runReadOnlyIntake } from '@/core/orchestrator';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** Accepts `raw_request` (canonical) or `input` as a convenience alias. */
const runRequestSchema = z
  .object({
    raw_request: z.string().min(1).optional(),
    input: z.string().min(1).optional(),
  })
  .refine((b) => Boolean(b.raw_request ?? b.input), {
    message: 'Provide a non-empty `raw_request` (or `input`).',
  });

export const POST = withRoute(async (request, { requestId }) => {
  const body = await parseJsonBody(request, runRequestSchema);
  const rawRequest = (body.raw_request ?? body.input)!;

  const result = await runReadOnlyIntake(rawRequest);
  return jsonOk(result, requestId);
});
