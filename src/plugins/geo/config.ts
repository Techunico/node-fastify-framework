import { GeoError } from "./errors";
import { GeoPluginConfig, GeoProviderName } from "./types";

const integer = (name: string, fallback: number): number => {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 0) throw new GeoError(`${name} must be a non-negative integer`);
  return value;
};

const value = (name: string): string => process.env[name]?.trim() ?? "";

const provider = (name: string, required: boolean): GeoProviderName | undefined => {
  const raw = value(name).toLowerCase();
  if (!raw && !required) return undefined;
  if (raw === GeoProviderName.Google || raw === GeoProviderName.TomTom) return raw;
  throw new GeoError(`${name} must be one of: google, tomtom`);
};

/** Reads provider credentials, base URLs, HTTP settings, and cache settings. */
export function loadGeoConfig(): GeoPluginConfig {
  return {
    provider: provider("GEO_PROVIDER", true) as GeoProviderName,
    fallbackProvider: provider("GEO_FALLBACK_PROVIDER", false),
    google: {
      apiKey: value("GOOGLE_MAPS_API_KEY"),
      mapsBaseUrl: value("GOOGLE_MAPS_BASE_URL"),
      routesBaseUrl: value("GOOGLE_ROUTES_BASE_URL"),
      placesBaseUrl: value("GOOGLE_PLACES_BASE_URL"),
      roadsBaseUrl: value("GOOGLE_ROADS_BASE_URL"),
      timeoutMs: integer("GEO_REQUEST_TIMEOUT_MS", 5_000),
      retries: integer("GEO_REQUEST_RETRIES", 2),
      retryDelayMs: integer("GEO_RETRY_DELAY_MS", 200),
    },
    tomtom: {
      apiKey: value("TOMTOM_API_KEY") || undefined,
      baseUrl: value("TOMTOM_BASE_URL") || undefined,
      timeoutMs: integer("GEO_REQUEST_TIMEOUT_MS", 5_000),
      retries: integer("GEO_REQUEST_RETRIES", 2),
      retryDelayMs: integer("GEO_RETRY_DELAY_MS", 200),
    },
    cacheTtl: {
      reverseGeocode: integer("GEO_CACHE_REVERSE_GEOCODE_TTL_SECONDS", 86_400),
      geocode: integer("GEO_CACHE_GEOCODE_TTL_SECONDS", 86_400),
      distanceMatrix: integer("GEO_CACHE_DISTANCE_MATRIX_TTL_SECONDS", 300),
      route: integer("GEO_CACHE_ROUTE_TTL_SECONDS", 300),
      routeMatrix: integer("GEO_CACHE_ROUTE_MATRIX_TTL_SECONDS", 300),
      placeDetails: integer("GEO_CACHE_PLACE_DETAILS_TTL_SECONDS", 86_400),
      timezone: integer("GEO_CACHE_TIMEZONE_TTL_SECONDS", 604_800),
    },
  };
}
