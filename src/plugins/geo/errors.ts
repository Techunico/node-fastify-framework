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
export class GeoError extends Error {
  constructor(
    message: string,
    public readonly code: GeoErrorCode = GeoErrorCode.Geo,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = new.target.name;
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
