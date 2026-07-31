import { GeoAdapter } from "../adapter";
import { ProviderError } from "../errors";
import {
  DistanceMatrixInput, DistanceMatrixResult, ElevationInput, ElevationResult, GeocodeInput,
  GeocodeResponse, GeoProviderName, NearestRoadInput, NearestRoadResult, PlaceAutocompleteInput,
  PlaceAutocompleteResult, PlaceDetailsInput, PlaceDetailsResult, ReverseGeocodeInput,
  ReverseGeocodeResult, RouteInput, RouteMatrixInput, RouteMatrixResult, RouteResult,
  SnapToRoadInput, SnapToRoadResult, SpeedLimitInput, SpeedLimitResult, TimezoneInput,
  TimezoneResult, TomTomGeoConfig,
} from "../types";

/** TomTom boundary placeholder. Implementations can be filled without changing GeoService. */
export class TomTomGeoProvider implements GeoAdapter {
  readonly name = GeoProviderName.TomTom;
  constructor(private readonly config: TomTomGeoConfig) { void this.config; }
  reverseGeocode(_input: ReverseGeocodeInput): Promise<ReverseGeocodeResult> { return this.todo("reverseGeocode"); }
  geocode(_input: GeocodeInput): Promise<GeocodeResponse> { return this.todo("geocode"); }
  distanceMatrix(_input: DistanceMatrixInput): Promise<DistanceMatrixResult> { return this.todo("distanceMatrix"); }
  routeMatrix(_input: RouteMatrixInput): Promise<RouteMatrixResult> { return this.todo("routeMatrix"); }
  route(_input: RouteInput): Promise<RouteResult> { return this.todo("route"); }
  snapToRoad(_input: SnapToRoadInput): Promise<SnapToRoadResult> { return this.todo("snapToRoad"); }
  placeAutocomplete(_input: PlaceAutocompleteInput): Promise<PlaceAutocompleteResult> { return this.todo("placeAutocomplete"); }
  placeDetails(_input: PlaceDetailsInput): Promise<PlaceDetailsResult> { return this.todo("placeDetails"); }
  timezone(_input: TimezoneInput): Promise<TimezoneResult> { return this.todo("timezone"); }
  elevation(_input: ElevationInput): Promise<ElevationResult> { return this.todo("elevation"); }
  nearestRoad(_input: NearestRoadInput): Promise<NearestRoadResult> { return this.todo("nearestRoad"); }
  speedLimit(_input: SpeedLimitInput): Promise<SpeedLimitResult> { return this.todo("speedLimit"); }

  private todo<T>(operation: string): Promise<T> {
    return Promise.reject(new ProviderError(`TomTom ${operation} is not implemented`, this.name));
  }
}
