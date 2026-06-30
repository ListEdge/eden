/**
 * Eden — OpenAI reasoning provider.
 *
 * The first concrete `ReasoningProvider`. Configured per the brief, with a thin
 * but real integration so the wiring is provably correct. It is intentionally
 * NOT yet woven into the orchestration loop — that integration is the job of
 * `core/reasoning` in a later milestone.
 *
 * The OpenAI client is created lazily, so importing this module never requires a
 * key and never runs at build time.
 */

import OpenAI from 'openai';
import { z } from 'zod';
import { getOpenAIConfig } from '@/lib/config/env';
import { ValidationError, toEdenError, EdenError } from '@/lib/errors';
import type {
  ReasoningProvider,
  CompletionRequest,
  CompletionResult,
  StructuredCompletionRequest,
  StructuredResult,
} from '@/lib/ai/types';

export class OpenAIReasoningProvider implements ReasoningProvider {
  readonly id = 'openai';
  readonly defaultModel: string;
  #client: OpenAI | null = null;

  constructor() {
    // Read config now for the default model, but defer client creation.
    this.defaultModel = getOpenAIConfig().model;
  }

  #getClient(): OpenAI {
    if (!this.#client) {
      const { apiKey } = getOpenAIConfig();
      this.#client = new OpenAI({ apiKey });
    }
    return this.#client;
  }

  async complete(request: CompletionRequest): Promise<CompletionResult> {
    const client = this.#getClient();
    const model = request.model ?? this.defaultModel;
    try {
      const response = await client.chat.completions.create({
        model,
        temperature: request.temperature ?? 0,
        max_tokens: request.maxOutputTokens,
        messages: request.messages.map((m) => ({ role: m.role, content: m.content })),
      });
      const text = response.choices[0]?.message?.content ?? '';
      return {
        text,
        model,
        usage: {
          inputTokens: response.usage?.prompt_tokens,
          outputTokens: response.usage?.completion_tokens,
        },
      };
    } catch (caught) {
      const err = toEdenError(caught);
      throw new EdenError('INTERNAL', `OpenAI completion failed: ${err.message}`, { cause: caught });
    }
  }

  async completeStructured<S extends z.ZodTypeAny>(
    request: StructuredCompletionRequest<S>,
  ): Promise<StructuredResult<z.infer<S>>> {
    // Ask for raw JSON, then validate against the caller's schema. A later
    // milestone can upgrade this to the provider's native structured-output
    // mode without changing the interface or any caller.
    const result = await this.complete({
      ...request,
      messages: [
        ...request.messages,
        { role: 'system', content: 'Respond with a single valid JSON object and nothing else.' },
      ],
    });

    let parsed: unknown;
    try {
      parsed = JSON.parse(stripCodeFences(result.text));
    } catch {
      throw new ValidationError('Reasoning provider did not return valid JSON', {
        provider: this.id,
        model: result.model,
      });
    }

    const validated = request.schema.safeParse(parsed);
    if (!validated.success) {
      throw new ValidationError('Reasoning provider output failed schema validation', {
        provider: this.id,
        issues: validated.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      });
    }
    return { data: validated.data, model: result.model, usage: result.usage };
  }
}

/** Tolerate models that wrap JSON in ```json fences. */
function stripCodeFences(text: string): string {
  const trimmed = text.trim();
  const fence = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(trimmed);
  return fence ? fence[1] : trimmed;
}

export function createOpenAIReasoningProvider(): ReasoningProvider {
  return new OpenAIReasoningProvider();
}
