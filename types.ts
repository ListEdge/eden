/**
 * Eden — Version endpoint.
 *
 * GET /api/version — reports the build's identity for support and debugging:
 * the npm package version (read server-side from package.json), the API
 * contract version, the deployed git commit (from Vercel's build env, when
 * present), and the Node.js runtime. This runs server-only, so importing
 * package.json is safe here.
 */

import { withRoute } from '@/lib/http/handler';
import { jsonOk } from '@/lib/http/responses';
import { API_VERSION, EDEN_VERSION } from '@/lib/config/constants';
import pkg from '../../../../package.json' with { type: 'json' };

export const dynamic = 'force-dynamic';

export const GET = withRoute(async (_request, { requestId }) => {
  return jsonOk(
    {
      // Authoritative package version; EDEN_VERSION is the human-facing label.
      version: pkg.version,
      releaseLabel: EDEN_VERSION,
      apiVersion: API_VERSION,
      commit: process.env.VERCEL_GIT_COMMIT_SHA ?? null,
      runtime: process.version,
    },
    requestId,
  );
});
