/**
 * Eden — Geoapify place-search provider.
 *
 * Two calls: geocode the free-text location to coordinates, then search for
 * restaurants near those coordinates. When a recognised cuisine is given, it
 * tries the cuisine-specific category first and falls back to all restaurants
 * if that returns nothing — so a slightly-off cuisine never yields an empty
 * result. Parsing is defensive: the provider reads only the fields it needs and
 * tolerates anything missing.
 *
 * Network note: this runs on the server and calls api.geoapify.com.
 */

import { getPlacesConfig } from '@/lib/config/env';
import type { PlaceQuery, PlaceResult, PlaceSearchProvider } from '@/lib/places/types';

const GEOCODE_URL = 'https://api.geoapify.com/v1/geocode/search';
const PLACES_URL = 'https://api.geoapify.com/v2/places';

/** Cuisines Geoapify exposes as `catering.restaurant.<cuisine>` subcategories. */
const KNOWN_CUISINES = new Set([
  'italian', 'pizza', 'chinese', 'indian', 'japanese', 'sushi', 'thai',
  'french', 'mexican', 'greek', 'spanish', 'korean', 'vietnamese', 'turkish',
  'lebanese', 'american', 'burger', 'seafood', 'steak_house', 'asian',
]);

function asString(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v : null;
}
function asNumber(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}
function props(feature: unknown): Record<string, unknown> {
  if (feature && typeof feature === 'object' && 'properties' in feature) {
    const p = (feature as { properties: unknown }).properties;
    if (p && typeof p === 'object') return p as Record<string, unknown>;
  }
  return {};
}
function features(data: unknown): unknown[] {
  if (data && typeof data === 'object' && 'features' in data) {
    const f = (data as { features: unknown }).features;
    if (Array.isArray(f)) return f;
  }
  return [];
}

async function getJson(url: string): Promise<unknown> {
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Geoapify request failed (HTTP ${res.status}): ${body.slice(0, 200)}`);
  }
  return res.json();
}

async function geocode(
  location: string,
  apiKey: string,
): Promise<{ lat: number; lon: number; label: string }> {
  const url = `${GEOCODE_URL}?text=${encodeURIComponent(location)}&limit=1&apiKey=${apiKey}`;
  const p = props(features(await getJson(url))[0]);
  const lat = asNumber(p.lat);
  const lon = asNumber(p.lon);
  if (lat === null || lon === null) {
    throw new Error(`Could not find the location "${location}".`);
  }
  return { lat, lon, label: asString(p.formatted) ?? location };
}

function mapResults(data: unknown): PlaceResult[] {
  const out: PlaceResult[] = [];
  for (const feature of features(data)) {
    const p = props(feature);
    const name = asString(p.name);
    if (!name) continue; // skip unnamed points of interest
    const categories = Array.isArray(p.categories) ? (p.categories as unknown[]) : [];
    const category =
      categories.map(String).find((c) => c.startsWith('catering')) ??
      (categories.length ? String(categories[0]) : null);
    out.push({
      name,
      address: asString(p.formatted) ?? asString(p.address_line2),
      category,
      distanceMeters: asNumber(p.distance),
      website: asString(p.website),
      lat: asNumber(p.lat),
      lon: asNumber(p.lon),
    });
  }
  return out;
}

async function placesSearch(
  categories: string,
  lat: number,
  lon: number,
  radius: number,
  limit: number,
  apiKey: string,
): Promise<PlaceResult[]> {
  const filter = `circle:${lon},${lat},${radius}`;
  const bias = `proximity:${lon},${lat}`;
  const url =
    `${PLACES_URL}?categories=${encodeURIComponent(categories)}` +
    `&filter=${encodeURIComponent(filter)}&bias=${encodeURIComponent(bias)}` +
    `&limit=${limit}&apiKey=${apiKey}`;
  return mapResults(await getJson(url));
}

export const geoapifyProvider: PlaceSearchProvider = {
  id: 'geoapify',
  async search(query: PlaceQuery): Promise<PlaceResult[]> {
    const { apiKey } = getPlacesConfig();
    const radius = query.radiusMeters ?? 5000;
    const limit = query.limit ?? 10;
    const { lat, lon } = await geocode(query.location, apiKey);

    const cuisine = query.cuisine?.trim().toLowerCase() || null;
    if (cuisine && KNOWN_CUISINES.has(cuisine)) {
      try {
        const specific = await placesSearch(
          `catering.restaurant.${cuisine}`,
          lat,
          lon,
          radius,
          limit,
          apiKey,
        );
        if (specific.length > 0) return specific;
      } catch {
        // Cuisine subcategory unsupported or empty — fall back to all restaurants.
      }
    }
    return placesSearch('catering.restaurant', lat, lon, radius, limit, apiKey);
  },
};
