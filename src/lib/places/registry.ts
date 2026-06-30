/**
 * Eden — Place-search provider registry.
 *
 * Mirrors the reasoning-provider registry: providers register by id, and the
 * configured one (default 'geoapify', via EDEN_PLACES_PROVIDER) is resolved on
 * demand and memoised. Adding Google later is: implement the provider, register
 * it here, set the env var — no caller changes.
 */

import { ConfigurationError } from '@/lib/errors';
import { getPlacesProviderId } from '@/lib/config/env';
import type { PlaceSearchProvider, PlaceSearchProviderFactory } from '@/lib/places/types';
import { geoapifyProvider } from '@/lib/places/providers/geoapify';

const factories = new Map<string, PlaceSearchProviderFactory>();
const instances = new Map<string, PlaceSearchProvider>();

export function registerPlaceSearchProvider(id: string, factory: PlaceSearchProviderFactory): void {
  factories.set(id, factory);
}

export function getPlaceSearchProvider(): PlaceSearchProvider {
  const id = getPlacesProviderId();
  const existing = instances.get(id);
  if (existing) return existing;

  const factory = factories.get(id);
  if (!factory) {
    throw new ConfigurationError(
      `Unknown place-search provider "${id}". Registered: ${[...factories.keys()].join(', ') || 'none'}.`,
    );
  }
  const instance = factory();
  instances.set(id, instance);
  return instance;
}

// Built-in providers.
registerPlaceSearchProvider('geoapify', () => geoapifyProvider);
