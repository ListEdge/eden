/**
 * Eden — Web-search provider registry.
 *
 * Mirrors the place-search registry: providers register by id, the configured
 * one (default 'tavily', via EDEN_SEARCH_PROVIDER) is resolved on demand and
 * memoised. Adding Brave/Serper later is: implement the provider, register it
 * here, set the env var — no caller changes.
 */

import { ConfigurationError } from '@/lib/errors';
import { getSearchProviderId } from '@/lib/config/env';
import type { WebSearchProvider, WebSearchProviderFactory } from '@/lib/search/types';
import { tavilyProvider } from '@/lib/search/providers/tavily';

const factories = new Map<string, WebSearchProviderFactory>();
const instances = new Map<string, WebSearchProvider>();

export function registerWebSearchProvider(id: string, factory: WebSearchProviderFactory): void {
  factories.set(id, factory);
}

export function getWebSearchProvider(): WebSearchProvider {
  const id = getSearchProviderId();
  const existing = instances.get(id);
  if (existing) return existing;

  const factory = factories.get(id);
  if (!factory) {
    throw new ConfigurationError(
      `Unknown web-search provider "${id}". Registered: ${[...factories.keys()].join(', ') || 'none'}.`,
    );
  }
  const instance = factory();
  instances.set(id, instance);
  return instance;
}

// Built-in providers.
registerWebSearchProvider('tavily', () => tavilyProvider);
