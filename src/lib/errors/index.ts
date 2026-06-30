/**
 * Eden — Error foundation.
 *
 * A single, typed error hierarchy used across every plane. Errors carry a
 * stable machine code, an HTTP status (for the API boundary), and optional
 * structured details. This is the foundation referenced by Core Contract
 * Rule 12 ("fail safe, not fail open"): every failure is an explicit, typed,
 * surfaced outcome — never a silent one.
 *
 * Future milestones extend this with domain-specific subclasses; they MUST
 * keep extending `EdenError` so the API/handler layer can map any error to a
 * consistent response envelope.
 */

/** Closed set of machine-readable error codes. Extend deliberately. */
export type EdenErrorCode =
  | 'INTERNAL'
  | 'NOT_IMPLEMENTED'
  | 'CONFIGURATION'
  | 'VALIDATION'
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'TOOL_UNAVAILABLE'
  | 'INVARIANT_VIOLATION'
  | 'ILLEGAL_TRANSITION'
  | 'APPROVAL_REQUIRED';

export interface EdenErrorOptions {
  /** HTTP status to surface at the API boundary. */
  httpStatus?: number;
  /** Structured, non-sensitive context safe to log and (often) return. */
  details?: Record<string, unknown>;
  /** Whether retrying the same request could succeed. Default false. */
  retryable?: boolean;
  /** Underlying cause, preserved for logs (never auto-serialised to clients). */
  cause?: unknown;
}

/** Base class for all Eden errors. */
export class EdenError extends Error {
  readonly code: EdenErrorCode;
  readonly httpStatus: number;
  readonly details?: Record<string, unknown>;
  readonly retryable: boolean;

  constructor(code: EdenErrorCode, message: string, options: EdenErrorOptions = {}) {
    super(message, options.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = new.target.name;
    this.code = code;
    this.httpStatus = options.httpStatus ?? 500;
    this.details = options.details;
    this.retryable = options.retryable ?? false;
    // Maintain a clean stack across transpilation targets.
    if (typeof Error.captureStackTrace === 'function') {
      Error.captureStackTrace(this, new.target);
    }
  }

  /** Shape safe to return over the API. Never includes `cause` or stack. */
  toResponse(): { code: EdenErrorCode; message: string; details?: Record<string, unknown> } {
    return { code: this.code, message: this.message, ...(this.details ? { details: this.details } : {}) };
  }
}

/**
 * Thrown by placeholder modules whose behaviour arrives in a later milestone.
 * Milestone 1 deliberately ships interfaces + stubs; calling an unimplemented
 * capability fails loudly rather than fabricating a result (Contract Rule 7).
 */
export class NotImplementedError extends EdenError {
  constructor(capability: string, milestone?: string) {
    super('NOT_IMPLEMENTED', `Not implemented in this milestone: ${capability}`, {
      httpStatus: 501,
      details: { capability, ...(milestone ? { plannedFor: milestone } : {}) },
    });
  }
}

/** A required piece of configuration (env var, credential) is missing or invalid. */
export class ConfigurationError extends EdenError {
  constructor(message: string, details?: Record<string, unknown>) {
    super('CONFIGURATION', message, { httpStatus: 500, details });
  }
}

/** Input failed schema validation at a boundary. */
export class ValidationError extends EdenError {
  constructor(message: string, details?: Record<string, unknown>) {
    super('VALIDATION', message, { httpStatus: 400, details });
  }
}

export class UnauthenticatedError extends EdenError {
  constructor(message = 'Authentication required') {
    super('UNAUTHENTICATED', message, { httpStatus: 401 });
  }
}

export class ForbiddenError extends EdenError {
  constructor(message = 'Not authorised for this action') {
    super('FORBIDDEN', message, { httpStatus: 403 });
  }
}

export class NotFoundError extends EdenError {
  constructor(message = 'Resource not found', details?: Record<string, unknown>) {
    super('NOT_FOUND', message, { httpStatus: 404, details });
  }
}

/** A required tool/integration is unavailable (Contract §6.4 — fail safe, never simulate). */
export class ToolUnavailableError extends EdenError {
  constructor(tool: string) {
    super('TOOL_UNAVAILABLE', `Tool unavailable: ${tool}`, {
      httpStatus: 503,
      retryable: true,
      details: { tool },
    });
  }
}

/** A Work Package invariant (Contract §4) would be violated. */
export class InvariantViolationError extends EdenError {
  constructor(message: string, details?: Record<string, unknown>) {
    super('INVARIANT_VIOLATION', message, { httpStatus: 422, details });
  }
}

/** An attempted state-machine transition is not in the legal set (Build Spec §4). */
export class IllegalTransitionError extends EdenError {
  constructor(from: string, to: string) {
    super('ILLEGAL_TRANSITION', `Illegal status transition: ${from} -> ${to}`, {
      httpStatus: 422,
      details: { from, to },
    });
  }
}

/** A Level 3 action was reached without a valid approval (Contract Rule 1). */
export class ApprovalRequiredError extends EdenError {
  constructor(workPackageId: string) {
    super('APPROVAL_REQUIRED', 'Explicit per-package approval is required before execution', {
      httpStatus: 403,
      details: { workPackageId },
    });
  }
}

/** Type guard. */
export function isEdenError(value: unknown): value is EdenError {
  return value instanceof EdenError;
}

/** Normalise any thrown value into an EdenError for uniform handling. */
export function toEdenError(value: unknown): EdenError {
  if (isEdenError(value)) return value;
  if (value instanceof Error) {
    return new EdenError('INTERNAL', value.message, { cause: value });
  }
  return new EdenError('INTERNAL', 'An unexpected error occurred', { cause: value });
}
