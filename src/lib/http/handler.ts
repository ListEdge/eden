/**
 * Eden — Route handler wrapper.
 *
 * Wraps an App Router route handler so that:
 *   1. every request gets a stable request id (echoed in the response + logs),
 *   2. any thrown value is normalised to an `EdenError` and rendered through the
 *      standard envelope with the right HTTP status, and
 *   3. failures are logged once, centrally.
 *
 * This is the single place the API boundary maps internal errors to HTTP, which
 * keeps individual routes thin and consistent (Contract Rule 12: fail safe).
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createLogger } from '@/lib/logging/logger';
import { toEdenError, ValidationError } from '@/lib/errors';
import { jsonError, type ApiResponse } from '@/lib/http/responses';

const log = createLogger('api');

/** Header clients may set to propagate their own correlation id. */
const REQUEST_ID_HEADER = 'x-request-id';

export interface RouteContext {
  requestId: string;
}

type RouteHandler<T> = (request: Request, ctx: RouteContext) => Promise<NextResponse<ApiResponse<T>>>;

/** Wrap a route handler with request-id assignment and centralised error handling. */
export function withRoute<T>(handler: RouteHandler<T>): (request: Request) => Promise<NextResponse> {
  return async (request: Request): Promise<NextResponse> => {
    const requestId = request.headers.get(REQUEST_ID_HEADER) ?? crypto.randomUUID();
    const requestLog = log.child({ requestId });
    try {
      const response = await handler(request, { requestId });
      response.headers.set(REQUEST_ID_HEADER, requestId);
      return response;
    } catch (caught) {
      const error = toEdenError(caught);
      // 5xx are unexpected; 4xx are client-correctable. Log accordingly.
      if (error.httpStatus >= 500) {
        requestLog.error(error.message, { code: error.code, details: error.details });
      } else {
        requestLog.warn(error.message, { code: error.code, details: error.details });
      }
      const response = jsonError(error.toResponse(), requestId, error.httpStatus);
      response.headers.set(REQUEST_ID_HEADER, requestId);
      return response;
    }
  };
}

/** Parse and validate a JSON request body against a zod schema. Throws ValidationError on failure. */
export async function parseJsonBody<S extends z.ZodTypeAny>(request: Request, schema: S): Promise<z.infer<S>> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    throw new ValidationError('Request body must be valid JSON');
  }
  const result = schema.safeParse(raw);
  if (!result.success) {
    throw new ValidationError('Request body failed validation', {
      issues: result.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    });
  }
  return result.data;
}
