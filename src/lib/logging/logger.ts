/**
 * Eden — Structured logging foundation.
 *
 * Emits one JSON object per line (machine-parseable in Vercel/any log drain).
 * This is the application-level log. It is NOT the audit trail: the immutable,
 * append-only record of system behaviour lives in the Memory Plane's event log
 * (see `core/audit`). Application logs are operational; audit events are truth.
 *
 * A light redaction pass masks obviously-sensitive keys before anything is
 * written, reflecting the secret-handling discipline in the Memory System spec
 * (§4.5 — secrets are never persisted or logged).
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_WEIGHT: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

/** Correlation fields that, when present, make logs traceable to a request/package. */
export interface LogContext {
  requestId?: string;
  correlationId?: string;
  workPackageId?: string;
  actionId?: string;
  [key: string]: unknown;
}

const REDACT_KEY_PATTERN =
  /(authorization|api[-_]?key|secret|password|token|service[-_]?role|connection[-_]?string|cookie)/i;
const REDACTED = '[REDACTED]';

/** Recursively mask sensitive-looking keys. Defensive, not a substitute for not logging secrets. */
function redact(value: unknown, depth = 0): unknown {
  if (depth > 6 || value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1));
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    out[k] = REDACT_KEY_PATTERN.test(k) ? REDACTED : redact(v, depth + 1);
  }
  return out;
}

function resolveMinLevel(): LogLevel {
  const raw = (process.env.EDEN_LOG_LEVEL ?? '').toLowerCase();
  return (['debug', 'info', 'warn', 'error'] as const).includes(raw as LogLevel)
    ? (raw as LogLevel)
    : process.env.NODE_ENV === 'production'
      ? 'info'
      : 'debug';
}

export interface Logger {
  debug(message: string, context?: LogContext): void;
  info(message: string, context?: LogContext): void;
  warn(message: string, context?: LogContext): void;
  error(message: string, context?: LogContext): void;
  /** Derive a child logger that always includes the given context. */
  child(bindings: LogContext): Logger;
}

function emit(scope: string, level: LogLevel, bindings: LogContext, message: string, context?: LogContext): void {
  if (LEVEL_WEIGHT[level] < LEVEL_WEIGHT[resolveMinLevel()]) return;
  const record = {
    ts: new Date().toISOString(),
    level,
    scope,
    msg: message,
    ...(redact({ ...bindings, ...context }) as Record<string, unknown>),
  };
  const line = JSON.stringify(record);
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
}

/** Create a scoped logger. `scope` identifies the module/plane emitting the log. */
export function createLogger(scope: string, bindings: LogContext = {}): Logger {
  return {
    debug: (m, c) => emit(scope, 'debug', bindings, m, c),
    info: (m, c) => emit(scope, 'info', bindings, m, c),
    warn: (m, c) => emit(scope, 'warn', bindings, m, c),
    error: (m, c) => emit(scope, 'error', bindings, m, c),
    child: (extra) => createLogger(scope, { ...bindings, ...extra }),
  };
}

/** Default application logger. Prefer a scoped logger via `createLogger`. */
export const logger = createLogger('eden');
