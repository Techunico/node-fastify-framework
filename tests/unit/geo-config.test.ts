import { GOOGLE_DEFAULT_BASE_URLS, loadGeoConfig } from "@/plugins/geo/config";
import { GoogleGeoProvider } from "@/plugins/geo/providers/google.provider";

describe("geo configuration", () => {
  it("defaults Google base URLs so only the API key is required", () => {
    const config = loadGeoConfig({ GEO_PROVIDER: "google", GOOGLE_MAPS_API_KEY: "key" });
    expect(config.google.mapsBaseUrl).toBe(GOOGLE_DEFAULT_BASE_URLS.maps);
    expect(config.google.roadsBaseUrl).toBe(GOOGLE_DEFAULT_BASE_URLS.roads);
    expect(() => new GoogleGeoProvider(config.google)).not.toThrow();
  });

  it("still requires the API key", () => {
    const config = loadGeoConfig({ GEO_PROVIDER: "google" });
    expect(() => new GoogleGeoProvider(config.google)).toThrow(/GOOGLE_MAPS_API_KEY/);
  });

  it("keeps explicit base URL overrides", () => {
    const config = loadGeoConfig({ GEO_PROVIDER: "google", GOOGLE_MAPS_BASE_URL: "http://proxy.local" });
    expect(config.google.mapsBaseUrl).toBe("http://proxy.local");
  });

  it("rejects the unimplemented TomTom provider as primary or fallback", () => {
    expect(() => loadGeoConfig({ GEO_PROVIDER: "tomtom" })).toThrow(/not supported yet/);
    expect(() => loadGeoConfig({ GEO_PROVIDER: "google", GEO_FALLBACK_PROVIDER: "tomtom" })).toThrow(/GEO_FALLBACK_PROVIDER/);
  });

  it("requires GEO_PROVIDER", () => {
    expect(() => loadGeoConfig({})).toThrow(/GEO_PROVIDER/);
  });
});
