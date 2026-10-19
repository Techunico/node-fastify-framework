import { GeoProviderName } from "./types";

export enum GeoErrorCode {
  Geo = "GEO_ERROR",
  Provider = "GEO_PROVIDER_ERROR",
  InvalidCoordinates = "INVALID_COORDINATES",
  RouteNotFound = "ROUTE_NOT_FOUND",
  GeocodeFailed = "GEOCODE_FAILED",
  ProviderTimeout = "GEO_PROVIDER_TIMEOUT",
}

/** Base class for all public geo failures. */
const STATUS_BY_CODE: Record<GeoErrorCode, number> = {
  [GeoErrorCode.Geo]: 500,
  [GeoErrorCode.Provider]: 502,
  [GeoErrorCode.InvalidCoordinates]: 400,
  [GeoErrorCode.RouteNotFound]: 404,
  [GeoErrorCode.GeocodeFailed]: 422,
  [GeoErrorCode.ProviderTimeout]: 504,
};

export class GeoError extends Error {
  constructor(
    message: string,
    public readonly code: GeoErrorCode = GeoErrorCode.Geo,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = new.target.name;
  }

  /** HTTP status used by the framework error handler. 4xx messages are shown to clients. */
  get statusCode(): number {
    return STATUS_BY_CODE[this.code] ?? 500;
  }
}

export class ProviderError extends GeoError {
  constructor(message: string, public readonly provider: GeoProviderName, cause?: unknown) {
    super(message, GeoErrorCode.Provider, cause);
  }
}

export class InvalidCoordinatesError extends GeoError {
  constructor(message = "Coordinates must contain a latitude from -90 to 90 and longitude from -180 to 180") {
    super(message, GeoErrorCode.InvalidCoordinates);
  }
}

export class RouteNotFoundError extends GeoError {
  constructor(message = "No route was found", cause?: unknown) {
    super(message, GeoErrorCode.RouteNotFound, cause);
  }
}

export class GeocodeFailedError extends GeoError {
  constructor(message = "Geocoding failed", cause?: unknown) {
    super(message, GeoErrorCode.GeocodeFailed, cause);
  }
}

export class ProviderTimeoutError extends ProviderError {
  override readonly code = GeoErrorCode.ProviderTimeout;

  constructor(provider: GeoProviderName, timeoutMs: number, cause?: unknown) {
    super(`${provider} did not respond within ${timeoutMs}ms`, provider, cause);
  }
}
