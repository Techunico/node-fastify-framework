import { GeoError } from "./errors";
import { GeoPluginConfig, GeoProviderName } from "./types";

type EnvSource = Readonly<Record<string, string | undefined>>;

const integer = (env: EnvSource, name: string, fallback: number): number => {
  const raw = env[name];
  if (raw === undefined || raw === "") return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 0) throw new GeoError(`${name} must be a non-negative integer`);
  return value;
};

const value = (env: EnvSource, name: string): string => env[name]?.trim() ?? "";

const provider = (env: EnvSource, name: string, required: boolean): GeoProviderName | undefined => {
  const raw = value(env, name).toLowerCase();
  if (!raw && !required) return undefined;
  if (raw === GeoProviderName.Google || raw === GeoProviderName.TomTom) return raw;
  throw new GeoError(`${name} must be one of: google, tomtom`);
};

/** Reads provider credentials, base URLs, HTTP settings, and cache settings. */
export function loadGeoConfig(env: EnvSource): GeoPluginConfig {
  return {
    provider: provider(env, "GEO_PROVIDER", true) as GeoProviderName,
    fallbackProvider: provider(env, "GEO_FALLBACK_PROVIDER", false),
    google: {
      apiKey: value(env, "GOOGLE_MAPS_API_KEY"),
      mapsBaseUrl: value(env, "GOOGLE_MAPS_BASE_URL"),
      routesBaseUrl: value(env, "GOOGLE_ROUTES_BASE_URL"),
      placesBaseUrl: value(env, "GOOGLE_PLACES_BASE_URL"),
      roadsBaseUrl: value(env, "GOOGLE_ROADS_BASE_URL"),
      timeoutMs: integer(env, "GEO_REQUEST_TIMEOUT_MS", 5_000),
      retries: integer(env, "GEO_REQUEST_RETRIES", 2),
      retryDelayMs: integer(env, "GEO_RETRY_DELAY_MS", 200),
    },
    tomtom: {
      apiKey: value(env, "TOMTOM_API_KEY") || undefined,
      baseUrl: value(env, "TOMTOM_BASE_URL") || undefined,
      timeoutMs: integer(env, "GEO_REQUEST_TIMEOUT_MS", 5_000),
      retries: integer(env, "GEO_REQUEST_RETRIES", 2),
      retryDelayMs: integer(env, "GEO_RETRY_DELAY_MS", 200),
    },
    cacheTtl: {
      reverseGeocode: integer(env, "GEO_CACHE_REVERSE_GEOCODE_TTL_SECONDS", 86_400),
      geocode: integer(env, "GEO_CACHE_GEOCODE_TTL_SECONDS", 86_400),
      distanceMatrix: integer(env, "GEO_CACHE_DISTANCE_MATRIX_TTL_SECONDS", 300),
      route: integer(env, "GEO_CACHE_ROUTE_TTL_SECONDS", 300),
      routeMatrix: integer(env, "GEO_CACHE_ROUTE_MATRIX_TTL_SECONDS", 300),
      placeDetails: integer(env, "GEO_CACHE_PLACE_DETAILS_TTL_SECONDS", 86_400),
      timezone: integer(env, "GEO_CACHE_TIMEZONE_TTL_SECONDS", 604_800),
    },
  };
}
