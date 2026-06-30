/**
 * Eden — Health endpoint.
 *
 * GET /api/health — a fast liveness/readiness probe. Returns 200 whenever the
 * app is serving, plus a non-sensitive view of which capabilities are
 * configured (so a deploy with zero env vars still reports healthy, just with
 * capabilities disabled). Never throws on missing config.
 */

import { withRoute } from '@/lib/http/handler';
import { jsonOk } from '@/lib/http/responses';
import { configStatus, nodeEnv } from '@/lib/config/env';
import { APP_NAME, EDEN_VERSION } from '@/lib/config/constants';

/** Config-dependent; never statically cached. */
export const dynamic = 'force-dynamic';

export const GET = withRoute(async (_request, { requestId }) => {
  return jsonOk(
    {
      app: APP_NAME,
      status: 'online' as const,
      version: EDEN_VERSION,
      environment: nodeEnv(),
      uptimeSeconds: Math.round(process.uptime()),
      capabilities: configStatus(),
    },
    requestId,
  );
});
