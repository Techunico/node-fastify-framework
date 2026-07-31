import {
  DistanceMatrixInput, DistanceMatrixResult, ElevationInput, ElevationResult,
  GeocodeInput, GeocodeResponse, GeoProviderName, NearestRoadInput, NearestRoadResult,
  PlaceAutocompleteInput, PlaceAutocompleteResult, PlaceDetailsInput, PlaceDetailsResult,
  ReverseGeocodeInput, ReverseGeocodeResult, RouteInput, RouteMatrixInput, RouteMatrixResult,
  RouteResult, SnapToRoadInput, SnapToRoadResult, SpeedLimitInput, SpeedLimitResult,
  TimezoneInput, TimezoneResult,
} from "./types";

/** Provider boundary. Implement this interface to add HERE, Mapbox, OSM, or another provider. */
export interface GeoAdapter {
  readonly name: GeoProviderName;
  reverseGeocode(input: ReverseGeocodeInput): Promise<ReverseGeocodeResult>;
  geocode(input: GeocodeInput): Promise<GeocodeResponse>;
  distanceMatrix(input: DistanceMatrixInput): Promise<DistanceMatrixResult>;
  routeMatrix(input: RouteMatrixInput): Promise<RouteMatrixResult>;
  route(input: RouteInput): Promise<RouteResult>;
  snapToRoad(input: SnapToRoadInput): Promise<SnapToRoadResult>;
  placeAutocomplete(input: PlaceAutocompleteInput): Promise<PlaceAutocompleteResult>;
  placeDetails(input: PlaceDetailsInput): Promise<PlaceDetailsResult>;
  timezone(input: TimezoneInput): Promise<TimezoneResult>;
  elevation(input: ElevationInput): Promise<ElevationResult>;
  nearestRoad(input: NearestRoadInput): Promise<NearestRoadResult>;
  speedLimit(input: SpeedLimitInput): Promise<SpeedLimitResult>;
}
