/**
 * Eden — Reasoning provider registry.
 *
 * Maps a provider id to a lazy factory and selects the active provider from
 * configuration (`EDEN_REASONING_PROVIDER`, default 'openai').
 *
 * To add Anthropic (or any provider) in a future milestone:
 *   1. Implement `ReasoningProvider` in `providers/anthropic.ts`.
 *   2. `registerReasoningProvider('anthropic', createAnthropicReasoningProvider)`.
 *   3. Set `EDEN_REASONING_PROVIDER=anthropic`.
 * No caller changes are required — that is the point of the abstraction.
 */

import { getReasoningProviderId } from '@/lib/config/env';
import { ConfigurationError } from '@/lib/errors';
import type { ReasoningProvider, ReasoningProviderFactory } from '@/lib/ai/types';
import { createOpenAIReasoningProvider } from '@/lib/ai/providers/openai';

const registry = new Map<string, ReasoningProviderFactory>();
const instances = new Map<string, ReasoningProvider>();

/** Register a provider factory under an id. Later registration overrides earlier. */
export function registerReasoningProvider(id: string, factory: ReasoningProviderFactory): void {
  registry.set(id, factory);
}

/** Built-in providers. */
registerReasoningProvider('openai', createOpenAIReasoningProvider);

/** Get a provider by id (or the configured default). Instances are memoised. */
export function getReasoningProvider(id: string = getReasoningProviderId()): ReasoningProvider {
  const existing = instances.get(id);
  if (existing) return existing;

  const factory = registry.get(id);
  if (!factory) {
    throw new ConfigurationError(`Unknown reasoning provider '${id}'`, {
      available: [...registry.keys()],
    });
  }
  const instance = factory();
  instances.set(id, instance);
  return instance;
}

/** Ids of all registered providers (for diagnostics/health). */
export function registeredProviders(): string[] {
  return [...registry.keys()];
}
