/**
 * Eden — Weather.
 *
 * Uses Open-Meteo, which is free and needs no API key. Two calls: geocode the
 * free-text location to coordinates, then fetch current conditions. Parsing is
 * defensive throughout. Because there is no credential and one obvious provider,
 * this is a single module rather than the provider/registry pattern used for
 * search and places.
 *
 * Network note: this runs on the server and calls open-meteo.com.
 */

const GEOCODE_URL = 'https://geocoding-api.open-meteo.com/v1/search';
const FORECAST_URL = 'https://api.open-meteo.com/v1/forecast';

/** Current conditions for a place. */
export interface WeatherResult {
  /** Resolved, human-readable place label, e.g. "Christchurch, New Zealand". */
  locationLabel: string;
  temperatureC: number | null;
  apparentC: number | null;
  humidityPct: number | null;
  windKph: number | null;
  isDay: boolean;
  /** Short text condition derived from the WMO weather code. */
  description: string;
}

/** WMO weather interpretation codes → short descriptions. */
const WMO: Record<number, string> = {
  0: 'Clear sky',
  1: 'Mainly clear',
  2: 'Partly cloudy',
  3: 'Overcast',
  45: 'Fog',
  48: 'Depositing rime fog',
  51: 'Light drizzle',
  53: 'Moderate drizzle',
  55: 'Dense drizzle',
  56: 'Light freezing drizzle',
  57: 'Dense freezing drizzle',
  61: 'Slight rain',
  63: 'Moderate rain',
  65: 'Heavy rain',
  66: 'Light freezing rain',
  67: 'Heavy freezing rain',
  71: 'Slight snow',
  73: 'Moderate snow',
  75: 'Heavy snow',
  77: 'Snow grains',
  80: 'Slight rain showers',
  81: 'Moderate rain showers',
  82: 'Violent rain showers',
  85: 'Slight snow showers',
  86: 'Heavy snow showers',
  95: 'Thunderstorm',
  96: 'Thunderstorm with slight hail',
  99: 'Thunderstorm with heavy hail',
};

function asNumber(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}
function asString(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

async function getJson(url: string): Promise<unknown> {
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Open-Meteo request failed (HTTP ${res.status}): ${body.slice(0, 200)}`);
  }
  return res.json();
}

async function geocode(
  location: string,
): Promise<{ lat: number; lon: number; label: string }> {
  const url = `${GEOCODE_URL}?name=${encodeURIComponent(location)}&count=1&language=en&format=json`;
  const data = await getJson(url);
  const root = (data && typeof data === 'object' ? data : {}) as Record<string, unknown>;
  const results = Array.isArray(root.results) ? root.results : [];
  if (results.length === 0) {
    throw new Error(`Could not find a place called "${location}".`);
  }
  const first = (results[0] && typeof results[0] === 'object' ? results[0] : {}) as Record<
    string,
    unknown
  >;
  const lat = asNumber(first.latitude);
  const lon = asNumber(first.longitude);
  if (lat === null || lon === null) {
    throw new Error(`Could not resolve coordinates for "${location}".`);
  }
  const name = asString(first.name) || location;
  const country = asString(first.country);
  const label = country ? `${name}, ${country}` : name;
  return { lat, lon, label };
}

/** Fetch current conditions for a free-text location. */
export async function getWeather(location: string): Promise<WeatherResult> {
  const { lat, lon, label } = await geocode(location);
  const params = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lon),
    current: 'temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m,is_day',
    wind_speed_unit: 'kmh',
    temperature_unit: 'celsius',
    timezone: 'auto',
  });
  const data = await getJson(`${FORECAST_URL}?${params.toString()}`);
  const root = (data && typeof data === 'object' ? data : {}) as Record<string, unknown>;
  const current = (root.current && typeof root.current === 'object' ? root.current : {}) as Record<
    string,
    unknown
  >;

  const code = asNumber(current.weather_code);
  return {
    locationLabel: label,
    temperatureC: asNumber(current.temperature_2m),
    apparentC: asNumber(current.apparent_temperature),
    humidityPct: asNumber(current.relative_humidity_2m),
    windKph: asNumber(current.wind_speed_10m),
    isDay: asNumber(current.is_day) === 1,
    description: code !== null && WMO[code] ? WMO[code] : 'Unknown conditions',
  };
}
