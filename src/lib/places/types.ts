/**
 * Eden — Place search types.
 *
 * The place-search capability is provider-agnostic, exactly like the reasoning
 * layer: callers depend on `PlaceSearchProvider`, and a concrete provider
 * (Geoapify first, Google etc. later) plugs in behind it with no caller changes.
 * This is what lets the Execution Plane's restaurant tool swap data sources by
 * changing a single environment variable.
 */

/** A request to find places near a location. */
export interface PlaceQuery {
  /** Free-text location to search near, e.g. "Christchurch, New Zealand". */
  location: string;
  /** Optional cuisine to narrow a restaurant search, e.g. "italian". */
  cuisine?: string | null;
  /** Search radius in metres (provider applies a default when omitted). */
  radiusMeters?: number;
  /** Maximum number of results. */
  limit?: number;
}

/** A single place returned by a provider. */
export interface PlaceResult {
  name: string;
  address: string | null;
  category: string | null;
  distanceMeters: number | null;
  website: string | null;
  lat: number | null;
  lon: number | null;
}

/** A pluggable source of place data. */
export interface PlaceSearchProvider {
  readonly id: string;
  search(query: PlaceQuery): Promise<PlaceResult[]>;
}

export type PlaceSearchProviderFactory = () => PlaceSearchProvider;
