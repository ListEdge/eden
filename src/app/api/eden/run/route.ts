/**
 * Eden — Run endpoint (scaffold).
 *
 * POST /api/eden/run — the single entry point for human intent. In a later
 * milestone this opens a Work Package and hands it to the Orchestrator, which
 * drives the deterministic loop to its next halt or terminal state.
 *
 * Milestone 1 deliberately does NOT run that loop. It validates the request and
 * returns a structured NOT_IMPLEMENTED (501) that echoes the captured intent and
 * the fixed lifecycle the request will pass through. It writes nothing and
 * fabricates nothing (Core Contract Rules 7 and 12): no Work Package is created,
 * no state is touched.
 *
 * Wiring point for the next milestone is marked below (Build Spec T1 → INGEST).
 */

import { z } from 'zod';
import { withRoute, parseJsonBody } from '@/lib/http/handler';
import { jsonError } from '@/lib/http/responses';
import { API_VERSION } from '@/lib/config/constants';

export const dynamic = 'force-dynamic';

/** Accepts `raw_request` (canonical) or `input` as a convenience alias. */
const runRequestSchema = z
  .object({
    raw_request: z.string().min(1).optional(),
    input: z.string().min(1).optional(),
  })
  .refine((b) => Boolean(b.raw_request ?? b.input), {
    message: 'Provide a non-empty `raw_request` (or `input`).',
  });

/** The fixed lifecycle every request passes through (Core Contract §2). */
const LIFECYCLE = [
  { stage: 1, name: 'INGEST', halts: false },
  { stage: 2, name: 'UNDERSTAND', halts: false },
  { stage: 3, name: 'GATE_A', halts: true },
  { stage: 4, name: 'PLAN', halts: false },
  { stage: 5, name: 'STATE_WRITE', halts: false },
  { stage: 6, name: 'GATE_B', halts: true },
  { stage: 7, name: 'EXECUTE', halts: false },
  { stage: 8, name: 'VERIFY', halts: false },
  { stage: 9, name: 'COMMIT', halts: false },
  { stage: 10, name: 'RETURN', halts: false },
] as const;

export const POST = withRoute(async (request, { requestId }) => {
  const body = await parseJsonBody(request, runRequestSchema);
  const rawRequest = (body.raw_request ?? body.input)!;

  // ── Next-milestone wiring (Build Spec T1) ──────────────────────────────────
  // const wp = await memoryApi.createRequest({ tenant_id, principal_id, raw_text: rawRequest })
  //              .then(/* open Work Package in RECEIVED */);
  // await orchestrator.drive(wp.id);
  // return jsonOk({ work_package_id: wp.id, status: wp.status }, requestId, 202);
  // ───────────────────────────────────────────────────────────────────────────

  return jsonError(
    {
      code: 'NOT_IMPLEMENTED',
      message:
        'The Eden run loop is scaffolded but not implemented in this milestone. ' +
        'No Work Package was created and no state was changed.',
      details: {
        received: { raw_request: rawRequest },
        next_status_when_implemented: 'RECEIVED',
        lifecycle: LIFECYCLE,
        apiVersion: API_VERSION,
      },
    },
    requestId,
    501,
  );
});
