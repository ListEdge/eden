/**
 * Eden — Standard API response envelope.
 *
 * Every JSON endpoint returns the same shape so clients (and future dashboards)
 * can handle success and failure uniformly. Success and error are discriminated
 * by `ok`. `meta` always carries a request id and the API contract version,
 * which makes responses traceable back to logs and audit events.
 */

import { NextResponse } from 'next/server';
import { API_VERSION } from '@/lib/config/constants';
import type { EdenErrorCode } from '@/lib/errors';

export interface ResponseMeta {
  requestId: string;
  timestamp: string;
  apiVersion: string;
}

export interface ApiError {
  code: EdenErrorCode;
  message: string;
  details?: Record<string, unknown>;
}

export type ApiResponse<T> =
  | { ok: true; data: T; meta: ResponseMeta }
  | { ok: false; error: ApiError; meta: ResponseMeta };

function meta(requestId: string): ResponseMeta {
  return { requestId, timestamp: new Date().toISOString(), apiVersion: API_VERSION };
}

/** Build a success response. */
export function jsonOk<T>(data: T, requestId: string, status = 200): NextResponse<ApiResponse<T>> {
  return NextResponse.json({ ok: true as const, data, meta: meta(requestId) }, { status });
}

/** Build an error response. */
export function jsonError(
  error: ApiError,
  requestId: string,
  status: number,
): NextResponse<ApiResponse<never>> {
  return NextResponse.json({ ok: false as const, error, meta: meta(requestId) }, { status });
}
