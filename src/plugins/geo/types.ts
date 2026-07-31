/** Provider identifiers understood by the geo plugin. */
export enum GeoProviderName {
  Google = "google",
  TomTom = "tomtom",
}

export enum TravelMode {
  Driving = "DRIVE",
  Walking = "WALK",
  Bicycling = "BICYCLE",
  Transit = "TRANSIT",
  TwoWheeler = "TWO_WHEELER",
}

export enum DistanceUnit {
  Meters = "meters",
  Kilometers = "kilometers",
  Miles = "miles",
}

export interface Coordinates {
  latitude: number;
  longitude: number;
}

export interface GeoRequestOptions {
  signal?: AbortSignal;
}

export interface AddressComponent {
  longName: string;
  shortName: string;
  types: string[];
}

export interface GeocodeResult {
  id: string;
  formattedAddress: string;
  location: Coordinates;
  addressComponents: AddressComponent[];
  types: string[];
}

export interface ReverseGeocodeInput extends GeoRequestOptions {
  location: Coordinates;
  language?: string;
  resultTypes?: string[];
}

export interface ReverseGeocodeResult {
  results: GeocodeResult[];
}

export interface GeocodeInput extends GeoRequestOptions {
  address: string;
  language?: string;
  region?: string;
  bounds?: BoundingBox;
}

export interface GeocodeResponse {
  results: GeocodeResult[];
}

export interface MatrixLocation {
  location: Coordinates;
  placeId?: string;
}

export interface MatrixElement {
  originIndex: number;
  destinationIndex: number;
  status: string;
  distanceMeters?: number;
  durationSeconds?: number;
}

export interface DistanceMatrixInput extends GeoRequestOptions {
  origins: MatrixLocation[];
  destinations: MatrixLocation[];
  travelMode?: TravelMode;
  departureTime?: Date;
  language?: string;
}

export interface DistanceMatrixResult {
  originAddresses: string[];
  destinationAddresses: string[];
  elements: MatrixElement[];
}

export interface RouteMatrixInput extends GeoRequestOptions {
  origins: MatrixLocation[];
  destinations: MatrixLocation[];
  travelMode?: TravelMode;
  departureTime?: Date;
}

export interface RouteMatrixResult {
  elements: MatrixElement[];
}

export interface RouteInput extends GeoRequestOptions {
  origin: MatrixLocation;
  destination: MatrixLocation;
  intermediates?: MatrixLocation[];
  travelMode?: TravelMode;
  alternatives?: boolean;
  departureTime?: Date;
  language?: string;
}

export interface RouteLeg {
  startLocation: Coordinates;
  endLocation: Coordinates;
  distanceMeters: number;
  durationSeconds: number;
  encodedPolyline?: string;
}

export interface RouteResultItem {
  distanceMeters: number;
  durationSeconds: number;
  encodedPolyline?: string;
  legs: RouteLeg[];
}

export interface RouteResult {
  routes: RouteResultItem[];
}

export interface SnapToRoadInput extends GeoRequestOptions {
  path: Coordinates[];
  interpolate?: boolean;
}

export interface SnappedPoint {
  location: Coordinates;
  originalIndex?: number;
  placeId?: string;
}

export interface SnapToRoadResult {
  points: SnappedPoint[];
}

export interface PlaceAutocompleteInput extends GeoRequestOptions {
  input: string;
  sessionToken?: string;
  location?: Coordinates;
  radiusMeters?: number;
  language?: string;
  countryCodes?: string[];
}

export interface PlacePrediction {
  placeId: string;
  description: string;
  mainText?: string;
  secondaryText?: string;
  types: string[];
}

export interface PlaceAutocompleteResult {
  predictions: PlacePrediction[];
}

export interface PlaceDetailsInput extends GeoRequestOptions {
  placeId: string;
  sessionToken?: string;
  language?: string;
}

export interface PlaceDetailsResult {
  placeId: string;
  name?: string;
  formattedAddress?: string;
  location?: Coordinates;
  phoneNumber?: string;
  website?: string;
  rating?: number;
  types: string[];
}

export interface TimezoneInput extends GeoRequestOptions {
  location: Coordinates;
  timestamp?: Date;
  language?: string;
}

export interface TimezoneResult {
  id: string;
  name: string;
  rawOffsetSeconds: number;
  daylightOffsetSeconds: number;
}

export interface ElevationInput extends GeoRequestOptions {
  locations: Coordinates[];
}

export interface ElevationPoint {
  location: Coordinates;
  elevationMeters: number;
  resolutionMeters?: number;
}

export interface ElevationResult {
  points: ElevationPoint[];
}

export interface NearestRoadInput extends GeoRequestOptions {
  points: Coordinates[];
}

export interface NearestRoadResult {
  points: SnappedPoint[];
}

export interface SpeedLimitInput extends GeoRequestOptions {
  placeIds?: string[];
  path?: Coordinates[];
  units?: "KPH" | "MPH";
}

export interface SpeedLimitItem {
  placeId: string;
  speedLimit: number;
  units: "KPH" | "MPH";
}

export interface SpeedLimitResult {
  speedLimits: SpeedLimitItem[];
}

export interface BoundingBox {
  north: number;
  south: number;
  east: number;
  west: number;
}

export interface PointInsidePolygonInput { point: Coordinates; polygon: Coordinates[]; }
export interface PointOnPolylineInput { point: Coordinates; polyline: Coordinates[]; }
export interface PointOnLineInput { point: Coordinates; start: Coordinates; end: Coordinates; }
export interface PointNearPolylineInput extends PointOnPolylineInput { toleranceMeters: number; }
export interface PointWithinRadiusInput { point: Coordinates; center: Coordinates; radiusMeters: number; }
export interface DistanceInput { from: Coordinates; to: Coordinates; accuracyMeters?: number; }
export interface PathInput { path: Coordinates[]; }
export interface BearingInput { from: Coordinates; to: Coordinates; type?: "great-circle" | "rhumb"; }
export interface DestinationPointInput { origin: Coordinates; distanceMeters: number; bearingDegrees: number; }
export interface InterpolateInput { from: Coordinates; to: Coordinates; fraction: number; }
export interface SimplifyPolylineInput { path: Coordinates[]; toleranceMeters?: number; }
export interface EncodedPolylineInput { encodedPolyline: string; precision?: number; }
export interface EncodePolylineInput { path: Coordinates[]; precision?: number; }
export interface BufferPointInput { center: Coordinates; radiusMeters: number; segments?: number; }
export interface BoundingBoxInput { center: Coordinates; radiusMeters: number; }
export interface BoundingBoxesIntersectInput { first: BoundingBox; second: BoundingBox; }
export interface NearestPointInput { point: Coordinates; candidates: Coordinates[]; }
export interface OrderByDistanceInput extends NearestPointInput {}
export interface NearestPolylineInput { point: Coordinates; polylines: Coordinates[][]; }
export interface NearestPolygonInput { point: Coordinates; polygons: Coordinates[][]; }
export interface NearestGeometryResult { index: number; distanceMeters: number; nearestPoint: Coordinates; }
export interface CalculateEtaInput { departureTime: Date; durationSeconds: number; }
export interface TravelTimeInput { distanceMeters: number; averageSpeedKph: number; }
export interface AverageSpeedInput { distanceMeters: number; durationSeconds: number; }
export interface LocationChangedInput { previous: Coordinates; current: Coordinates; thresholdMeters?: number; }
export interface NormalizeCoordinatesInput { coordinates: Coordinates | readonly [number, number] | string; }
export interface ParseCoordinatesInput { value: string; order?: "lat-lng" | "lng-lat"; }
export interface FindNearestResult { point: Coordinates; index: number; distanceMeters: number; }
export interface OrderedDistanceResult extends FindNearestResult {}

export interface GeoCacheTtlConfig {
  reverseGeocode: number;
  geocode: number;
  distanceMatrix: number;
  route: number;
  routeMatrix: number;
  placeDetails: number;
  timezone: number;
}

export interface ProviderHttpConfig {
  timeoutMs: number;
  retries: number;
  retryDelayMs: number;
}

export interface GoogleGeoConfig extends ProviderHttpConfig {
  apiKey: string;
  mapsBaseUrl: string;
  routesBaseUrl: string;
  placesBaseUrl: string;
  roadsBaseUrl: string;
}

export interface TomTomGeoConfig extends ProviderHttpConfig {
  apiKey?: string;
  baseUrl?: string;
}

export interface GeoPluginConfig {
  provider: GeoProviderName;
  fallbackProvider?: GeoProviderName;
  google: GoogleGeoConfig;
  tomtom: TomTomGeoConfig;
  cacheTtl: GeoCacheTtlConfig;
}
