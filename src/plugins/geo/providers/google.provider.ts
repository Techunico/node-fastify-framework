import { GeoAdapter } from "../adapter";
import { GeocodeFailedError, GeoError, ProviderError, RouteNotFoundError } from "../errors";
import { GeoHttpClient } from "../http-client";
import {
  AddressComponent, Coordinates, DistanceMatrixInput, DistanceMatrixResult, ElevationInput,
  ElevationResult, GeocodeInput, GeocodeResponse, GeocodeResult, GeoProviderName,
  GoogleGeoConfig, MatrixLocation, NearestRoadInput, NearestRoadResult, PlaceAutocompleteInput,
  PlaceAutocompleteResult, PlaceDetailsInput, PlaceDetailsResult, ReverseGeocodeInput,
  ReverseGeocodeResult, RouteInput, RouteMatrixInput, RouteMatrixResult, RouteResult,
  SnapToRoadInput, SnapToRoadResult, SpeedLimitInput, SpeedLimitResult, TimezoneInput,
  TimezoneResult, TravelMode,
} from "../types";

interface GoogleLatLng { lat: number; lng: number; }
interface GoogleApiLatLng { latitude: number; longitude: number; }
interface GoogleAddressComponent { long_name: string; short_name: string; types: string[]; }
interface GoogleGeocodeItem {
  place_id: string;
  formatted_address: string;
  geometry: { location: GoogleLatLng };
  address_components?: GoogleAddressComponent[];
  types?: string[];
}
interface GoogleStatusResponse { status: string; error_message?: string; }
interface GoogleGeocodeResponse extends GoogleStatusResponse { results: GoogleGeocodeItem[]; }
interface GoogleValueText { value?: number; text?: string; }
interface GoogleMatrixElement { status: string; distance?: GoogleValueText; duration?: GoogleValueText; }
interface GoogleDistanceMatrixResponse extends GoogleStatusResponse {
  origin_addresses?: string[];
  destination_addresses?: string[];
  rows?: Array<{ elements: GoogleMatrixElement[] }>;
}
interface GoogleRouteLeg {
  startLocation?: { latLng: GoogleApiLatLng };
  endLocation?: { latLng: GoogleApiLatLng };
  distanceMeters?: number;
  duration?: string;
  polyline?: { encodedPolyline?: string };
}
interface GoogleRoute {
  distanceMeters?: number;
  duration?: string;
  polyline?: { encodedPolyline?: string };
  legs?: GoogleRouteLeg[];
}
interface GoogleRoutesResponse { routes?: GoogleRoute[]; }
interface GoogleRouteMatrixElement {
  originIndex: number;
  destinationIndex: number;
  status?: { code?: number; message?: string };
  condition?: string;
  distanceMeters?: number;
  duration?: string;
}
interface GoogleSnappedPoint { location: GoogleApiLatLng; originalIndex?: number; placeId?: string; }
interface GoogleRoadsResponse { snappedPoints?: GoogleSnappedPoint[]; warningMessage?: string; }
interface GoogleLocalizedText { text?: string; }
interface GooglePlacePrediction {
  placeId?: string;
  text?: GoogleLocalizedText;
  types?: string[];
  structuredFormat?: { mainText?: GoogleLocalizedText; secondaryText?: GoogleLocalizedText };
}
interface GoogleAutocompleteResponse {
  suggestions?: Array<{ placePrediction?: GooglePlacePrediction }>;
}
interface GooglePlace {
  id: string;
  displayName?: GoogleLocalizedText;
  formattedAddress?: string;
  location?: GoogleApiLatLng;
  nationalPhoneNumber?: string;
  websiteUri?: string;
  rating?: number;
  types?: string[];
}
interface GoogleTimezoneResponse extends GoogleStatusResponse {
  timeZoneId?: string;
  timeZoneName?: string;
  rawOffset?: number;
  dstOffset?: number;
}
interface GoogleElevationResponse extends GoogleStatusResponse {
  results?: Array<{ location: GoogleLatLng; elevation: number; resolution?: number }>;
}
interface GoogleSpeedLimitResponse {
  speedLimits?: Array<{ placeId: string; speedLimit: number; units: "KPH" | "MPH" }>;
}

interface GoogleWaypoint {
  placeId?: string;
  location?: { latLng: GoogleApiLatLng };
}

const durationSeconds = (duration?: string): number => {
  if (!duration) return 0;
  const value = Number(duration.endsWith("s") ? duration.slice(0, -1) : duration);
  return Number.isFinite(value) ? value : 0;
};

const coordinates = (value: GoogleLatLng): Coordinates => ({ latitude: value.lat, longitude: value.lng });
const apiCoordinates = (value: GoogleApiLatLng): Coordinates => ({ latitude: value.latitude, longitude: value.longitude });
const coordinateString = (value: Coordinates): string => `${value.latitude},${value.longitude}`;
const pathString = (path: Coordinates[]): string => path.map(coordinateString).join("|");
const waypoint = (value: MatrixLocation): GoogleWaypoint => value.placeId
  ? { placeId: value.placeId }
  : { location: { latLng: { latitude: value.location.latitude, longitude: value.location.longitude } } };

const travelMode = (mode = TravelMode.Driving): string => mode;

/** Complete Google implementation that translates all responses into framework DTOs. */
export class GoogleGeoProvider implements GeoAdapter {
  private static readonly ENDPOINTS = {
    GEOCODE: "/maps/api/geocode/json",
    DISTANCE_MATRIX: "/maps/api/distancematrix/json",
    COMPUTE_ROUTE: "/directions/v2:computeRoutes",
    COMPUTE_ROUTE_MATRIX: "/distanceMatrix/v2:computeRouteMatrix",
    SNAP_TO_ROADS: "/v1/snapToRoads",
    NEAREST_ROADS: "/v1/nearestRoads",
    SPEED_LIMITS: "/v1/speedLimits",
    PLACE_AUTOCOMPLETE: "/v1/places:autocomplete",
    TIMEZONE: "/maps/api/timezone/json",
    ELEVATION: "/maps/api/elevation/json",
  } as const;

  readonly name = GeoProviderName.Google;
  private readonly http: GeoHttpClient;

  constructor(private readonly config: GoogleGeoConfig) {
    this.assertConfiguration();
    this.http = new GeoHttpClient(this.name, config);
  }

  async reverseGeocode(input: ReverseGeocodeInput): Promise<ReverseGeocodeResult> {
    const response = await this.http.request<GoogleGeocodeResponse>({
      method: "GET", url: this.url(this.config.mapsBaseUrl, GoogleGeoProvider.ENDPOINTS.GEOCODE), signal: input.signal,
      params: {
        latlng: coordinateString(input.location), key: this.config.apiKey, language: input.language,
        result_type: input.resultTypes?.join("|"),
      },
    });
    this.assertGoogleStatus(response, "reverse geocoding");
    return { results: response.results.map((item) => this.mapGeocode(item)) };
  }

  async geocode(input: GeocodeInput): Promise<GeocodeResponse> {
    const response = await this.http.request<GoogleGeocodeResponse>({
      method: "GET", url: this.url(this.config.mapsBaseUrl, GoogleGeoProvider.ENDPOINTS.GEOCODE), signal: input.signal,
      params: {
        address: input.address, key: this.config.apiKey, language: input.language, region: input.region,
        bounds: input.bounds
          ? `${input.bounds.south},${input.bounds.west}|${input.bounds.north},${input.bounds.east}`
          : undefined,
      },
    });
    this.assertGoogleStatus(response, "geocoding");
    return { results: response.results.map((item) => this.mapGeocode(item)) };
  }

  async distanceMatrix(input: DistanceMatrixInput): Promise<DistanceMatrixResult> {
    const response = await this.http.request<GoogleDistanceMatrixResponse>({
      method: "GET", url: this.url(this.config.mapsBaseUrl, GoogleGeoProvider.ENDPOINTS.DISTANCE_MATRIX), signal: input.signal,
      params: {
        origins: input.origins.map((item) => this.matrixLocationString(item)).join("|"),
        destinations: input.destinations.map((item) => this.matrixLocationString(item)).join("|"),
        mode: this.legacyTravelMode(input.travelMode), key: this.config.apiKey, language: input.language,
        departure_time: input.departureTime ? Math.floor(input.departureTime.getTime() / 1_000) : undefined,
      },
    });
    this.assertGoogleStatus(response, "distance matrix");
    const elements = (response.rows ?? []).flatMap((row, originIndex) =>
      row.elements.map((element, destinationIndex) => ({
        originIndex, destinationIndex, status: element.status,
        distanceMeters: element.distance?.value, durationSeconds: element.duration?.value,
      })),
    );
    return {
      originAddresses: response.origin_addresses ?? [],
      destinationAddresses: response.destination_addresses ?? [],
      elements,
    };
  }

  async routeMatrix(input: RouteMatrixInput): Promise<RouteMatrixResult> {
    const response = await this.http.request<GoogleRouteMatrixElement[]>({
      method: "POST", url: this.url(this.config.routesBaseUrl, GoogleGeoProvider.ENDPOINTS.COMPUTE_ROUTE_MATRIX), signal: input.signal,
      headers: this.routesHeaders("originIndex,destinationIndex,status,condition,distanceMeters,duration"),
      data: {
        origins: input.origins.map((item) => ({ waypoint: waypoint(item) })),
        destinations: input.destinations.map((item) => ({ waypoint: waypoint(item) })),
        travelMode: travelMode(input.travelMode),
        departureTime: input.departureTime?.toISOString(),
      },
    });
    return { elements: response.map((item) => ({
      originIndex: item.originIndex, destinationIndex: item.destinationIndex,
      status: item.condition ?? item.status?.message ?? String(item.status?.code ?? "UNKNOWN"),
      distanceMeters: item.distanceMeters, durationSeconds: durationSeconds(item.duration),
    })) };
  }

  async route(input: RouteInput): Promise<RouteResult> {
    const response = await this.http.request<GoogleRoutesResponse>({
      method: "POST", url: this.url(this.config.routesBaseUrl, GoogleGeoProvider.ENDPOINTS.COMPUTE_ROUTE), signal: input.signal,
      headers: this.routesHeaders("routes.distanceMeters,routes.duration,routes.polyline.encodedPolyline,routes.legs.startLocation,routes.legs.endLocation,routes.legs.distanceMeters,routes.legs.duration,routes.legs.polyline.encodedPolyline"),
      data: {
        origin: waypoint(input.origin), destination: waypoint(input.destination),
        intermediates: input.intermediates?.map(waypoint), travelMode: travelMode(input.travelMode),
        computeAlternativeRoutes: input.alternatives ?? false, departureTime: input.departureTime?.toISOString(),
        languageCode: input.language,
      },
    });
    if (!response.routes?.length) throw new RouteNotFoundError();
    return { routes: response.routes.map((route) => ({
      distanceMeters: route.distanceMeters ?? 0,
      durationSeconds: durationSeconds(route.duration),
      encodedPolyline: route.polyline?.encodedPolyline,
      legs: (route.legs ?? []).map((leg) => ({
        startLocation: this.routeCoordinates(leg.startLocation?.latLng),
        endLocation: this.routeCoordinates(leg.endLocation?.latLng),
        distanceMeters: leg.distanceMeters ?? 0, durationSeconds: durationSeconds(leg.duration),
        encodedPolyline: leg.polyline?.encodedPolyline,
      })),
    })) };
  }

  async snapToRoad(input: SnapToRoadInput): Promise<SnapToRoadResult> {
    const response = await this.roadsRequest(GoogleGeoProvider.ENDPOINTS.SNAP_TO_ROADS, input.path, input.signal, {
      interpolate: input.interpolate ?? false,
    });
    return { points: this.mapSnappedPoints(response) };
  }

  async placeAutocomplete(input: PlaceAutocompleteInput): Promise<PlaceAutocompleteResult> {
    const response = await this.http.request<GoogleAutocompleteResponse>({
      method: "POST",
      url: this.url(this.config.placesBaseUrl, GoogleGeoProvider.ENDPOINTS.PLACE_AUTOCOMPLETE),
      signal: input.signal,
      headers: this.googleHeaders("suggestions.placePrediction.placeId,suggestions.placePrediction.text,suggestions.placePrediction.structuredFormat,suggestions.placePrediction.types"),
      data: {
        input: input.input,
        sessionToken: input.sessionToken,
        languageCode: input.language,
        includedRegionCodes: input.countryCodes,
        locationBias: input.location ? {
          circle: {
            center: { latitude: input.location.latitude, longitude: input.location.longitude },
            radius: input.radiusMeters ?? 50_000,
          },
        } : undefined,
      },
    });
    return { predictions: (response.suggestions ?? []).flatMap((suggestion) => {
      const prediction = suggestion.placePrediction;
      if (!prediction?.placeId) return [];
      return [{
        placeId: prediction.placeId,
        description: prediction.text?.text ?? "",
        types: prediction.types ?? [],
        mainText: prediction.structuredFormat?.mainText?.text,
        secondaryText: prediction.structuredFormat?.secondaryText?.text,
      }];
    }) };
  }

  async placeDetails(input: PlaceDetailsInput): Promise<PlaceDetailsResult> {
    const response = await this.http.request<GooglePlace>({
      method: "GET",
      url: this.url(this.config.placesBaseUrl, GoogleGeoProvider.placeDetailsEndpoint(input.placeId)),
      signal: input.signal,
      headers: this.googleHeaders("id,displayName,formattedAddress,location,nationalPhoneNumber,websiteUri,rating,types"),
      params: {
        sessionToken: input.sessionToken,
        languageCode: input.language,
      },
    });
    return {
      placeId: response.id,
      name: response.displayName?.text,
      formattedAddress: response.formattedAddress,
      location: response.location ? apiCoordinates(response.location) : undefined,
      phoneNumber: response.nationalPhoneNumber,
      website: response.websiteUri,
      rating: response.rating,
      types: response.types ?? [],
    };
  }

  async timezone(input: TimezoneInput): Promise<TimezoneResult> {
    const response = await this.http.request<GoogleTimezoneResponse>({
      method: "GET", url: this.url(this.config.mapsBaseUrl, GoogleGeoProvider.ENDPOINTS.TIMEZONE), signal: input.signal,
      params: {
        location: coordinateString(input.location),
        timestamp: Math.floor((input.timestamp ?? new Date()).getTime() / 1_000),
        language: input.language, key: this.config.apiKey,
      },
    });
    this.assertGoogleStatus(response, "timezone");
    if (!response.timeZoneId || !response.timeZoneName) {
      throw new ProviderError("Google timezone response was incomplete", this.name);
    }
    return {
      id: response.timeZoneId, name: response.timeZoneName,
      rawOffsetSeconds: response.rawOffset ?? 0, daylightOffsetSeconds: response.dstOffset ?? 0,
    };
  }

  async elevation(input: ElevationInput): Promise<ElevationResult> {
    const response = await this.http.request<GoogleElevationResponse>({
      method: "GET", url: this.url(this.config.mapsBaseUrl, GoogleGeoProvider.ENDPOINTS.ELEVATION), signal: input.signal,
      params: { locations: pathString(input.locations), key: this.config.apiKey },
    });
    this.assertGoogleStatus(response, "elevation");
    return { points: (response.results ?? []).map((item) => ({
      location: coordinates(item.location), elevationMeters: item.elevation, resolutionMeters: item.resolution,
    })) };
  }

  async nearestRoad(input: NearestRoadInput): Promise<NearestRoadResult> {
    const response = await this.roadsRequest(GoogleGeoProvider.ENDPOINTS.NEAREST_ROADS, input.points, input.signal);
    return { points: this.mapSnappedPoints(response) };
  }

  async speedLimit(input: SpeedLimitInput): Promise<SpeedLimitResult> {
    let placeIds = input.placeIds ?? [];
    if (!placeIds.length && input.path?.length) {
      const nearest = await this.nearestRoad({ points: input.path, signal: input.signal });
      placeIds = nearest.points.flatMap((point) => point.placeId ? [point.placeId] : []);
    }
    if (!placeIds.length) throw new GeoError("speedLimit requires placeIds or a path");
    const response = await this.http.request<GoogleSpeedLimitResponse>({
      method: "GET", url: this.url(this.config.roadsBaseUrl, GoogleGeoProvider.ENDPOINTS.SPEED_LIMITS), signal: input.signal,
      params: { placeId: placeIds, units: input.units, key: this.config.apiKey },
      paramsSerializer: { indexes: null },
    });
    return { speedLimits: (response.speedLimits ?? []).map((item) => ({
      placeId: item.placeId, speedLimit: item.speedLimit, units: item.units,
    })) };
  }

  private async roadsRequest(
    endpoint: string, path: Coordinates[], signal?: AbortSignal, extraParams: Record<string, string | boolean> = {},
  ): Promise<GoogleRoadsResponse> {
    return this.http.request<GoogleRoadsResponse>({
      method: "GET", url: this.url(this.config.roadsBaseUrl, endpoint), signal,
      params: { path: pathString(path), key: this.config.apiKey, ...extraParams },
    });
  }

  private mapSnappedPoints(response: GoogleRoadsResponse): SnapToRoadResult["points"] {
    return (response.snappedPoints ?? []).map((point) => ({
      location: apiCoordinates(point.location), originalIndex: point.originalIndex, placeId: point.placeId,
    }));
  }

  private mapGeocode(item: GoogleGeocodeItem): GeocodeResult {
    const components: AddressComponent[] = (item.address_components ?? []).map((part) => ({
      longName: part.long_name, shortName: part.short_name, types: part.types,
    }));
    return {
      id: item.place_id, formattedAddress: item.formatted_address,
      location: coordinates(item.geometry.location), addressComponents: components, types: item.types ?? [],
    };
  }

  private routeCoordinates(value?: GoogleApiLatLng): Coordinates {
    if (!value) throw new ProviderError("Google Routes response omitted a requested location", this.name);
    return apiCoordinates(value);
  }

  private assertGoogleStatus(response: GoogleStatusResponse, operation: string): void {
    if (response.status === "OK") return;
    if (response.status === "ZERO_RESULTS" && operation.includes("geocod")) return;
    if (operation.includes("geocod")) throw new GeocodeFailedError(response.error_message ?? `Google ${operation} failed`);
    throw new ProviderError(response.error_message ?? `Google ${operation} failed: ${response.status}`, this.name);
  }

  private routesHeaders(fields: string): Record<string, string> {
    return { ...this.googleHeaders(fields), "Content-Type": "application/json" };
  }

  private googleHeaders(fields: string): Record<string, string> {
    return { "X-Goog-Api-Key": this.config.apiKey, "X-Goog-FieldMask": fields };
  }

  private legacyTravelMode(mode = TravelMode.Driving): string {
    const values: Record<TravelMode, string> = {
      [TravelMode.Driving]: "driving", [TravelMode.Walking]: "walking",
      [TravelMode.Bicycling]: "bicycling", [TravelMode.Transit]: "transit",
      [TravelMode.TwoWheeler]: "driving",
    };
    return values[mode];
  }

  private matrixLocationString(item: MatrixLocation): string {
    return item.placeId ? `place_id:${item.placeId}` : coordinateString(item.location);
  }

  private url(baseUrl: string, endpoint: string): string {
    try { return new URL(endpoint, baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`).toString(); }
    catch (error: unknown) { throw new GeoError("Invalid Google base URL or endpoint configuration", undefined, error); }
  }

  private static placeDetailsEndpoint(placeId: string): string {
    return `/v1/places/${encodeURIComponent(placeId)}`;
  }

  private assertConfiguration(): void {
    const required: Array<[string, string]> = [
      ["GOOGLE_MAPS_API_KEY", this.config.apiKey], ["GOOGLE_MAPS_BASE_URL", this.config.mapsBaseUrl],
      ["GOOGLE_ROUTES_BASE_URL", this.config.routesBaseUrl], ["GOOGLE_PLACES_BASE_URL", this.config.placesBaseUrl],
      ["GOOGLE_ROADS_BASE_URL", this.config.roadsBaseUrl],
    ];
    const missing = required.filter(([, configured]) => !configured).map(([name]) => name);
    if (missing.length) throw new GeoError(`Missing Google geo configuration: ${missing.join(", ")}`);
  }
}
