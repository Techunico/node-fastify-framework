import {
  computeDestinationPoint as geolibDestinationPoint,
  findNearest as geolibFindNearest,
  getBounds as geolibGetBounds,
  getBoundsOfDistance,
  getCenter as geolibGetCenter,
  getCompassDirection as geolibCompassDirection,
  getDistance as geolibDistance,
  getDistanceFromLine,
  getGreatCircleBearing,
  getPathLength as geolibPathLength,
  getRhumbLineBearing,
  isPointInLine,
  isPointInPolygon,
  isPointNearLine,
  isPointWithinRadius as geolibPointWithinRadius,
  orderByDistance as geolibOrderByDistance,
} from "geolib";
import { createHash } from "node:crypto";
import { GeoAdapter } from "./adapter";
import { GeoError, InvalidCoordinatesError } from "./errors";
import {
  AverageSpeedInput,
  BearingInput,
  BoundingBox,
  BoundingBoxInput,
  BoundingBoxesIntersectInput,
  BufferPointInput,
  CalculateEtaInput,
  Coordinates,
  DestinationPointInput,
  DistanceInput,
  DistanceMatrixInput,
  DistanceMatrixResult,
  ElevationInput,
  ElevationResult,
  EncodePolylineInput,
  EncodedPolylineInput,
  FindNearestResult,
  GeocodeInput,
  GeocodeResponse,
  GeoCacheTtlConfig,
  InterpolateInput,
  LocationChangedInput,
  NearestGeometryResult,
  NearestPointInput,
  NearestPolygonInput,
  NearestPolylineInput,
  NearestRoadInput,
  NearestRoadResult,
  NormalizeCoordinatesInput,
  OrderedDistanceResult,
  OrderByDistanceInput,
  ParseCoordinatesInput,
  PathInput,
  PlaceAutocompleteInput,
  PlaceAutocompleteResult,
  PlaceDetailsInput,
  PlaceDetailsResult,
  PointInsidePolygonInput,
  PointNearPolylineInput,
  PointOnLineInput,
  PointOnPolylineInput,
  PointWithinRadiusInput,
  ReverseGeocodeInput,
  ReverseGeocodeResult,
  RouteInput,
  RouteMatrixInput,
  RouteMatrixResult,
  RouteResult,
  SimplifyPolylineInput,
  SnapToRoadInput,
  SnapToRoadResult,
  SpeedLimitInput,
  SpeedLimitResult,
  TimezoneInput,
  TimezoneResult,
  TravelTimeInput,
} from "./types";

export interface GeoCache {
  get<T>(key: string): Promise<T | null>;
  set(key: string, value: unknown, ttl?: number): Promise<unknown>;
}

export interface GeoLogger {
  debug(data: object, message?: string): void;
  warn(data: object, message?: string): void;
  error(data: object, message?: string): void;
}

interface CacheOptions {
  ttl: number;
  input: unknown;
}

const CACHE_PREFIX = "geo:v1";

const stableValue = (value: unknown): unknown => {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key, item]) => key !== "signal" && item !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, stableValue(item)]),
    );
  }
  return value;
};

/** Provider-independent facade for remote geo APIs and local geometry helpers. */
export class GeoService {
  constructor(
    private readonly providers: readonly GeoAdapter[],
    private readonly cacheTtl: GeoCacheTtlConfig,
    private readonly logger: GeoLogger,
    private readonly cache?: GeoCache,
  ) {
    if (!providers.length)
      throw new GeoError("At least one geo provider is required");
  }

  reverseGeocode(input: ReverseGeocodeInput): Promise<ReverseGeocodeResult> {
    this.assertCoordinates(input.location);
    return this.execute(
      "reverseGeocode",
      input,
      (provider) => provider.reverseGeocode(input),
      { ttl: this.cacheTtl.reverseGeocode, input },
    );
  }

  geocode(input: GeocodeInput): Promise<GeocodeResponse> {
    if (!input.address.trim())
      throw new GeoError("Geocode address cannot be empty");
    return this.execute(
      "geocode",
      input,
      (provider) => provider.geocode(input),
      { ttl: this.cacheTtl.geocode, input },
    );
  }

  distanceMatrix(input: DistanceMatrixInput): Promise<DistanceMatrixResult> {
    this.assertMatrix(input.origins, input.destinations);
    return this.execute(
      "distanceMatrix",
      input,
      (provider) => provider.distanceMatrix(input),
      { ttl: this.cacheTtl.distanceMatrix, input },
    );
  }

  routeMatrix(input: RouteMatrixInput): Promise<RouteMatrixResult> {
    this.assertMatrix(input.origins, input.destinations);
    return this.execute(
      "routeMatrix",
      input,
      (provider) => provider.routeMatrix(input),
      { ttl: this.cacheTtl.routeMatrix, input },
    );
  }

  route(input: RouteInput): Promise<RouteResult> {
    this.assertCoordinates(input.origin.location);
    this.assertCoordinates(input.destination.location);
    input.intermediates?.forEach((item) =>
      this.assertCoordinates(item.location),
    );
    return this.execute("route", input, (provider) => provider.route(input), {
      ttl: this.cacheTtl.route,
      input,
    });
  }

  snapToRoad(input: SnapToRoadInput): Promise<SnapToRoadResult> {
    this.assertPath(input.path);
    return this.execute("snapToRoad", input, (provider) =>
      provider.snapToRoad(input),
    );
  }

  placeAutocomplete(
    input: PlaceAutocompleteInput,
  ): Promise<PlaceAutocompleteResult> {
    if (!input.input.trim())
      throw new GeoError("Autocomplete input cannot be empty");
    if (input.location) this.assertCoordinates(input.location);
    return this.execute("placeAutocomplete", input, (provider) =>
      provider.placeAutocomplete(input),
    );
  }

  placeDetails(input: PlaceDetailsInput): Promise<PlaceDetailsResult> {
    if (!input.placeId.trim()) throw new GeoError("Place ID cannot be empty");
    return this.execute(
      "placeDetails",
      input,
      (provider) => provider.placeDetails(input),
      { ttl: this.cacheTtl.placeDetails, input },
    );
  }

  timezone(input: TimezoneInput): Promise<TimezoneResult> {
    this.assertCoordinates(input.location);
    return this.execute(
      "timezone",
      input,
      (provider) => provider.timezone(input),
      { ttl: this.cacheTtl.timezone, input },
    );
  }

  elevation(input: ElevationInput): Promise<ElevationResult> {
    this.assertPath(input.locations);
    return this.execute("elevation", input, (provider) =>
      provider.elevation(input),
    );
  }

  nearestRoad(input: NearestRoadInput): Promise<NearestRoadResult> {
    this.assertPath(input.points);
    return this.execute("nearestRoad", input, (provider) =>
      provider.nearestRoad(input),
    );
  }

  speedLimit(input: SpeedLimitInput): Promise<SpeedLimitResult> {
    input.path?.forEach((point) => this.assertCoordinates(point));
    return this.execute("speedLimit", input, (provider) =>
      provider.speedLimit(input),
    );
  }

  isPointInsidePolygon(input: PointInsidePolygonInput): boolean {
    return this.isPointInside(input);
  }
  isPointInside(input: PointInsidePolygonInput): boolean {
    this.assertCoordinates(input.point);
    this.assertPolygon(input.polygon);
    return isPointInPolygon(input.point, input.polygon);
  }

  isPointOnPolyline(input: PointOnPolylineInput): boolean {
    this.assertCoordinates(input.point);
    this.assertPath(input.polyline, 2);
    return input.polyline
      .slice(1)
      .some((end, index) =>
        isPointInLine(input.point, input.polyline[index], end),
      );
  }

  isPointOnLine(input: PointOnLineInput): boolean {
    this.assertCoordinates(input.point);
    this.assertCoordinates(input.start);
    this.assertCoordinates(input.end);
    return isPointInLine(input.point, input.start, input.end);
  }

  isPointNearPolyline(input: PointNearPolylineInput): boolean {
    this.assertCoordinates(input.point);
    this.assertPath(input.polyline, 2);
    return input.polyline
      .slice(1)
      .some((end, index) =>
        isPointNearLine(
          input.point,
          input.polyline[index],
          end,
          input.toleranceMeters,
        ),
      );
  }

  isPointWithinRadius(input: PointWithinRadiusInput): boolean {
    this.assertCoordinates(input.point);
    this.assertCoordinates(input.center);
    return geolibPointWithinRadius(
      input.point,
      input.center,
      input.radiusMeters,
    );
  }

  getDistance(input: DistanceInput): number {
    this.assertCoordinates(input.from);
    this.assertCoordinates(input.to);
    return geolibDistance(input.from, input.to, input.accuracyMeters);
  }

  getPathLength(input: PathInput): number {
    this.assertPath(input.path);
    return geolibPathLength(input.path);
  }

  getCenter(input: PathInput): Coordinates {
    this.assertPath(input.path);
    const center = geolibGetCenter(input.path);
    if (!center)
      throw new GeoError("Cannot calculate the center of an empty path");
    return { latitude: center.latitude, longitude: center.longitude };
  }

  getBounds(input: PathInput): BoundingBox {
    this.assertPath(input.path);
    const bounds = geolibGetBounds(input.path);
    return {
      north: bounds.maxLat,
      south: bounds.minLat,
      east: bounds.maxLng,
      west: bounds.minLng,
    };
  }

  calculateBearing(input: BearingInput): number {
    return input.type === "rhumb"
      ? this.getRhumbLineBearing(input)
      : this.getGreatCircleBearing(input);
  }

  getGreatCircleBearing(input: BearingInput): number {
    this.assertCoordinates(input.from);
    this.assertCoordinates(input.to);
    return getGreatCircleBearing(input.from, input.to);
  }

  getRhumbLineBearing(input: BearingInput): number {
    this.assertCoordinates(input.from);
    this.assertCoordinates(input.to);
    return getRhumbLineBearing(input.from, input.to);
  }

  getCompassDirection(input: BearingInput): string {
    this.assertCoordinates(input.from);
    this.assertCoordinates(input.to);
    return geolibCompassDirection(
      input.from,
      input.to,
      input.type === "rhumb" ? getRhumbLineBearing : getGreatCircleBearing,
    );
  }

  destinationPoint(input: DestinationPointInput): Coordinates {
    return this.computeDestinationPoint(input);
  }
  computeDestinationPoint(input: DestinationPointInput): Coordinates {
    this.assertCoordinates(input.origin);
    return geolibDestinationPoint(
      input.origin,
      input.distanceMeters,
      input.bearingDegrees,
    );
  }

  midPoint(input: DistanceInput): Coordinates {
    return this.interpolate({ from: input.from, to: input.to, fraction: 0.5 });
  }

  interpolate(input: InterpolateInput): Coordinates {
    this.assertCoordinates(input.from);
    this.assertCoordinates(input.to);
    if (input.fraction < 0 || input.fraction > 1)
      throw new GeoError("Interpolation fraction must be between 0 and 1");
    const distance = geolibDistance(input.from, input.to);
    const bearing = getGreatCircleBearing(input.from, input.to);
    return geolibDestinationPoint(
      input.from,
      distance * input.fraction,
      bearing,
    );
  }

  isPolygonClosed(input: PathInput): boolean {
    if (input.path.length < 2) return false;
    return this.isSameLocation({
      previous: input.path[0],
      current: input.path[input.path.length - 1],
      thresholdMeters: 0,
    });
  }

  isClockwise(input: PathInput): boolean {
    this.assertPolygon(input.path);
    let area = 0;
    for (let index = 0; index < input.path.length; index += 1) {
      const current = input.path[index];
      const next = input.path[(index + 1) % input.path.length];
      area +=
        (next.longitude - current.longitude) *
        (next.latitude + current.latitude);
    }
    return area > 0;
  }

  simplifyPolyline(input: SimplifyPolylineInput): Coordinates[] {
    this.assertPath(input.path, 2);
    const tolerance = input.toleranceMeters ?? 1;
    if (input.path.length <= 2) return [...input.path];
    let largest = 0;
    let largestIndex = 0;
    for (let index = 1; index < input.path.length - 1; index += 1) {
      const distance = getDistanceFromLine(
        input.path[index],
        input.path[0],
        input.path[input.path.length - 1],
      );
      if (distance > largest) {
        largest = distance;
        largestIndex = index;
      }
    }
    if (largest <= tolerance)
      return [input.path[0], input.path[input.path.length - 1]];
    const left = this.simplifyPolyline({
      path: input.path.slice(0, largestIndex + 1),
      toleranceMeters: tolerance,
    });
    const right = this.simplifyPolyline({
      path: input.path.slice(largestIndex),
      toleranceMeters: tolerance,
    });
    return [...left.slice(0, -1), ...right];
  }

  decodePolyline(input: EncodedPolylineInput): Coordinates[] {
    const factor = 10 ** (input.precision ?? 5);
    const result: Coordinates[] = [];
    let index = 0;
    let latitude = 0;
    let longitude = 0;
    while (index < input.encodedPolyline.length) {
      const lat = this.decodeValue(input.encodedPolyline, index);
      index = lat.index;
      latitude += lat.value;
      const lng = this.decodeValue(input.encodedPolyline, index);
      index = lng.index;
      longitude += lng.value;
      result.push({
        latitude: latitude / factor,
        longitude: longitude / factor,
      });
    }
    return result;
  }

  encodePolyline(input: EncodePolylineInput): string {
    this.assertPath(input.path);
    const factor = 10 ** (input.precision ?? 5);
    let previousLatitude = 0;
    let previousLongitude = 0;
    let encoded = "";
    for (const point of input.path) {
      const latitude = Math.round(point.latitude * factor);
      const longitude = Math.round(point.longitude * factor);
      encoded +=
        this.encodeValue(latitude - previousLatitude) +
        this.encodeValue(longitude - previousLongitude);
      previousLatitude = latitude;
      previousLongitude = longitude;
    }
    return encoded;
  }

  bufferPoint(input: BufferPointInput): Coordinates[] {
    this.assertCoordinates(input.center);
    const segments = input.segments ?? 64;
    if (segments < 3)
      throw new GeoError("A point buffer requires at least three segments");
    return Array.from({ length: segments + 1 }, (_, index) =>
      geolibDestinationPoint(
        input.center,
        input.radiusMeters,
        (index / segments) * 360,
      ),
    );
  }

  createBoundingBox(input: BoundingBoxInput): BoundingBox {
    this.assertCoordinates(input.center);
    const bounds = geolibGetBounds(
      getBoundsOfDistance(input.center, input.radiusMeters),
    );
    return {
      north: bounds.maxLat,
      south: bounds.minLat,
      east: bounds.maxLng,
      west: bounds.minLng,
    };
  }

  isBoundingBoxesIntersect(input: BoundingBoxesIntersectInput): boolean {
    return (
      input.first.west <= input.second.east &&
      input.first.east >= input.second.west &&
      input.first.south <= input.second.north &&
      input.first.north >= input.second.south
    );
  }

  findNearestPoint(input: NearestPointInput): FindNearestResult {
    return this.findNearest(input);
  }
  findNearest(input: NearestPointInput): FindNearestResult {
    this.assertCoordinates(input.point);
    this.assertPath(input.candidates);
    const nearest = geolibFindNearest(input.point, input.candidates);
    const point = this.normalizeCoordinates({
      coordinates: nearest as Coordinates,
    });
    return {
      point,
      index: input.candidates.findIndex((candidate) => candidate === nearest),
      distanceMeters: geolibDistance(input.point, point),
    };
  }

  orderByDistance(input: OrderByDistanceInput): OrderedDistanceResult[] {
    this.assertCoordinates(input.point);
    this.assertPath(input.candidates);
    return geolibOrderByDistance(input.point, input.candidates).map((item) => {
      const point = this.normalizeCoordinates({
        coordinates: item as Coordinates,
      });
      return {
        point,
        index: input.candidates.findIndex((candidate) => candidate === item),
        distanceMeters: geolibDistance(input.point, point),
      };
    });
  }

  findNearestPolyline(input: NearestPolylineInput): NearestGeometryResult {
    return this.findNearestGeometry(input.point, input.polylines);
  }

  findNearestPolygon(input: NearestPolygonInput): NearestGeometryResult {
    input.polygons.forEach((polygon) => this.assertPolygon(polygon));
    const containing = input.polygons.findIndex((polygon) =>
      isPointInPolygon(input.point, polygon),
    );
    return containing >= 0
      ? { index: containing, distanceMeters: 0, nearestPoint: input.point }
      : this.findNearestGeometry(input.point, input.polygons);
  }

  calculateETA(input: CalculateEtaInput): Date {
    return new Date(
      input.departureTime.getTime() + input.durationSeconds * 1_000,
    );
  }
  calculateTravelTime(input: TravelTimeInput): number {
    if (input.averageSpeedKph <= 0)
      throw new GeoError("Average speed must be greater than zero");
    return input.distanceMeters / (input.averageSpeedKph / 3.6);
  }
  calculateAverageSpeed(input: AverageSpeedInput): number {
    if (input.durationSeconds <= 0)
      throw new GeoError("Duration must be greater than zero");
    return (input.distanceMeters / input.durationSeconds) * 3.6;
  }
  calculateHeading(input: BearingInput): number {
    return this.calculateBearing(input);
  }
  isLocationChanged(input: LocationChangedInput): boolean {
    return (
      geolibDistance(input.previous, input.current) >
      (input.thresholdMeters ?? 5)
    );
  }
  isSameLocation(input: LocationChangedInput): boolean {
    return (
      geolibDistance(input.previous, input.current) <=
      (input.thresholdMeters ?? 1)
    );
  }

  normalizeCoordinates(input: NormalizeCoordinatesInput): Coordinates {
    if (typeof input.coordinates === "string")
      return this.parseCoordinates({ value: input.coordinates });
    if (Array.isArray(input.coordinates)) {
      return this.checkedCoordinates({
        latitude: Number(input.coordinates[0]),
        longitude: Number(input.coordinates[1]),
      });
    }
    const value = input.coordinates as Coordinates;
    return this.checkedCoordinates({
      latitude: Number(value.latitude),
      longitude: Number(value.longitude),
    });
  }

  validateCoordinates(input: Coordinates): boolean {
    return (
      Number.isFinite(input.latitude) &&
      Number.isFinite(input.longitude) &&
      input.latitude >= -90 &&
      input.latitude <= 90 &&
      input.longitude >= -180 &&
      input.longitude <= 180
    );
  }

  parseCoordinates(input: ParseCoordinatesInput): Coordinates {
    const parts = input.value
      .trim()
      .split(/[\s,]+/)
      .map(Number);
    if (parts.length !== 2 || parts.some((item) => !Number.isFinite(item)))
      throw new InvalidCoordinatesError("Unable to parse coordinates");
    const coordinates =
      input.order === "lng-lat"
        ? { latitude: parts[1], longitude: parts[0] }
        : { latitude: parts[0], longitude: parts[1] };
    return this.checkedCoordinates(coordinates);
  }

  private async execute<T>(
    operation: string,
    input: { signal?: AbortSignal },
    call: (provider: GeoAdapter) => Promise<T>,
    cache?: CacheOptions,
  ): Promise<T> {
    const startedAt = performance.now();
    const fingerprint = cache
      ? createHash("sha256")
          .update(JSON.stringify(stableValue(cache.input)))
          .digest("hex")
      : undefined;
    const cacheKey =
      cache && cache.ttl > 0
        ? `${CACHE_PREFIX}:${this.providers[0].name}:${operation}:${fingerprint}`
        : undefined;
    if (this.cache && cacheKey) {
      try {
        const cached = await this.cache.get<T>(cacheKey);
        if (cached !== null) {
          this.logger.debug(
            {
              operation,
              provider: this.providers[0].name,
              cache: "hit",
              durationMs: performance.now() - startedAt,
            },
            "Geo operation completed",
          );
          return cached;
        }
        this.logger.debug(
          { operation, provider: this.providers[0].name, cache: "miss" },
          "Geo cache miss",
        );
      } catch (error: unknown) {
        this.logger.warn(
          {
            operation,
            provider: this.providers[0].name,
            cache: "read-failed",
            err: error,
          },
          "Geo cache read failed",
        );
      }
    }

    let lastError: unknown;
    for (let index = 0; index < this.providers.length; index += 1) {
      const provider = this.providers[index];
      try {
        const result = await call(provider);
        if (this.cache && cacheKey && cache) {
          try {
            await this.cache.set(cacheKey, result, cache.ttl);
          } catch (error: unknown) {
            this.logger.warn(
              {
                operation,
                provider: provider.name,
                cache: "write-failed",
                err: error,
              },
              "Geo cache write failed",
            );
          }
        }
        this.logger.debug(
          {
            operation,
            provider: provider.name,
            cache: cacheKey ? "miss" : "disabled",
            durationMs: performance.now() - startedAt,
          },
          "Geo operation completed",
        );
        return result;
      } catch (error: unknown) {
        lastError = error;
        if (input.signal?.aborted) throw error;
        const hasFallback = index < this.providers.length - 1;
        this.logger[hasFallback ? "warn" : "error"](
          {
            operation,
            provider: provider.name,
            fallback: hasFallback,
            err: error,
          },
          "Geo provider operation failed",
        );
      }
    }
    throw lastError instanceof Error
      ? lastError
      : new GeoError(`${operation} failed`, undefined, lastError);
  }

  private findNearestGeometry(
    point: Coordinates,
    geometries: Coordinates[][],
  ): NearestGeometryResult {
    this.assertCoordinates(point);
    if (!geometries.length)
      throw new GeoError("At least one geometry is required");
    let best: NearestGeometryResult | undefined;
    geometries.forEach((geometry, index) => {
      this.assertPath(geometry);
      const candidates =
        geometry.length === 1
          ? [geometry[0]]
          : geometry
              .slice(1)
              .map((end, segmentIndex) =>
                this.nearestPointOnSegment(point, geometry[segmentIndex], end),
              );
      const candidate = this.findNearest({ point, candidates });
      if (!best || candidate.distanceMeters < best.distanceMeters) {
        best = {
          index,
          distanceMeters: candidate.distanceMeters,
          nearestPoint: candidate.point,
        };
      }
    });
    if (!best) throw new GeoError("No nearest geometry found");
    return best;
  }

  private nearestPointOnSegment(
    point: Coordinates,
    start: Coordinates,
    end: Coordinates,
  ): Coordinates {
    const radians = Math.PI / 180;
    const degrees = 180 / Math.PI;
    const cosine = Math.max(Math.cos(point.latitude * radians), Number.EPSILON);
    const project = (value: Coordinates): readonly [number, number] => [
      value.longitude * radians * cosine,
      value.latitude * radians,
    ];
    const [px, py] = project(point);
    const [sx, sy] = project(start);
    const [ex, ey] = project(end);
    const dx = ex - sx;
    const dy = ey - sy;
    const lengthSquared = dx * dx + dy * dy;
    const fraction =
      lengthSquared === 0
        ? 0
        : Math.max(
            0,
            Math.min(1, ((px - sx) * dx + (py - sy) * dy) / lengthSquared),
          );
    return {
      latitude: (sy + fraction * dy) * degrees,
      longitude: ((sx + fraction * dx) / cosine) * degrees,
    };
  }

  private assertMatrix(
    origins: Array<{ location: Coordinates }>,
    destinations: Array<{ location: Coordinates }>,
  ): void {
    if (!origins.length || !destinations.length)
      throw new GeoError("Matrix origins and destinations cannot be empty");
    [...origins, ...destinations].forEach((item) =>
      this.assertCoordinates(item.location),
    );
  }

  private assertPolygon(polygon: Coordinates[]): void {
    this.assertPath(polygon, 3);
  }
  private assertPath(path: Coordinates[], minimum = 1): void {
    if (path.length < minimum)
      throw new GeoError(`At least ${minimum} coordinate(s) are required`);
    path.forEach((point) => this.assertCoordinates(point));
  }
  private assertCoordinates(input: Coordinates): void {
    if (!this.validateCoordinates(input)) throw new InvalidCoordinatesError();
  }
  private checkedCoordinates(input: Coordinates): Coordinates {
    this.assertCoordinates(input);
    return input;
  }
  private encodeValue(value: number): string {
    let encoded = "";
    let current = value < 0 ? ~(value << 1) : value << 1;
    while (current >= 0x20) {
      encoded += String.fromCharCode((0x20 | (current & 0x1f)) + 63);
      current >>= 5;
    }
    return encoded + String.fromCharCode(current + 63);
  }
  private decodeValue(
    encoded: string,
    start: number,
  ): { value: number; index: number } {
    let result = 0;
    let shift = 0;
    let index = start;
    let byte: number;
    do {
      if (index >= encoded.length)
        throw new GeoError("Invalid encoded polyline");
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    return { value: result & 1 ? ~(result >> 1) : result >> 1, index };
  }
}
