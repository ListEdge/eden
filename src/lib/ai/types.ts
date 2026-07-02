/**
 * Eden — Provider-agnostic reasoning interface.
 *
 * The Reasoning Plane depends on THIS interface, never on a vendor SDK. Adding
 * a new provider (e.g. Anthropic) means implementing `ReasoningProvider` and
 * registering it (see `registry.ts`) — no changes to callers. This is the
 * decoupling the brief requires.
 *
 * The Build Spec designates the reasoning model run at temperature 0 with
 * schema-constrained JSON output (Build Spec §1, Risk R6 — "structural
 * determinism"). `completeStructured` exists for exactly that: structured,
 * validated output rather than free text.
 */

import type { z } from 'zod';

export type Role = 'system' | 'user' | 'assistant';

export interface Message {
  role: Role;
  content: string;
}

export interface CompletionRequest {
  messages: Message[];
  /** Default 0 for determinism-as-possible (Build Spec §1). */
  temperature?: number;
  maxOutputTokens?: number;
  /** Override the provider's default model for this call. */
  model?: string;
}

export interface TokenUsage {
  inputTokens?: number;
  outputTokens?: number;
}

export interface CompletionResult {
  text: string;
  model: string;
  usage?: TokenUsage;
}

export interface StructuredCompletionRequest<S extends z.ZodTypeAny> extends CompletionRequest {
  /** The shape the model output must satisfy. Output is parsed + validated against it. */
  schema: S;
  /** Optional name to hint the provider's structured-output mode. */
  schemaName?: string;
}

export interface StructuredResult<T> {
  data: T;
  model: string;
  usage?: TokenUsage;
}

/**
 * The contract every reasoning provider implements.
 *
 * Implementations are constructed lazily and only need their credentials when a
 * method is actually called (Milestone 1 deploys without keys).
 */
export interface ReasoningProvider {
  /** Stable provider id, e.g. 'openai', 'anthropic'. */
  readonly id: string;
  /** Model used when a request does not override it. */
  readonly defaultModel: string;
  /** Free-text completion. */
  complete(request: CompletionRequest): Promise<CompletionResult>;
  /** Streaming free-text completion: yields text deltas as they arrive. */
  completeStream(request: CompletionRequest): AsyncIterable<string>;
  /** Schema-validated structured completion (preferred for planning/understanding). */
  completeStructured<S extends z.ZodTypeAny>(
    request: StructuredCompletionRequest<S>,
  ): Promise<StructuredResult<z.infer<S>>>;
}

/** Factory signature used by the registry to lazily construct a provider. */
export type ReasoningProviderFactory = () => ReasoningProvider;
