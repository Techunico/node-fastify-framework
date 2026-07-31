import { FastifyInstance, FastifyPluginAsync } from "fastify";
import fp from "fastify-plugin";
import { GeoAdapter } from "./adapter";
import { loadGeoConfig } from "./config";
import { GeoError } from "./errors";
import { GoogleGeoProvider } from "./providers/google.provider";
import { TomTomGeoProvider } from "./providers/tomtom.provider";
import { GeoCache, GeoService } from "./service";
import { GeoPluginConfig, GeoProviderName } from "./types";

export interface GeoPluginOptions { config?: GeoPluginConfig; }

// FastifyInstance.geo is declared optionally in src/types/fastify.d.ts

const createProvider = (name: GeoProviderName, config: GeoPluginConfig): GeoAdapter => {
  switch (name) {
    case GeoProviderName.Google: return new GoogleGeoProvider(config.google);
    case GeoProviderName.TomTom: return new TomTomGeoProvider(config.tomtom);
    default: throw new GeoError(`Unsupported geo provider: ${String(name)}`);
  }
};

const registerGeo: FastifyPluginAsync<GeoPluginOptions> = async (
  app: FastifyInstance,
  options: GeoPluginOptions,
): Promise<void> => {
  const config = options.config ?? loadGeoConfig();
  const providerNames = [config.provider, config.fallbackProvider]
    .filter((name): name is GeoProviderName => name !== undefined)
    .filter((name, index, names) => names.indexOf(name) === index);
  const providers = providerNames.map((name) => createProvider(name, config));
  const cache = app.hasDecorator("cache") ? (app.getDecorator("cache") as GeoCache) : undefined;

  app.decorate("geo", new GeoService(providers, config.cacheTtl, app.log, cache));
  app.log.info({
    provider: config.provider,
    fallbackProvider: config.fallbackProvider,
    cacheEnabled: Boolean(cache),
  }, "Geo plugin registered");
};

/** Register with `await app.register(GeoPlugin)`. */
export const GeoPlugin = fp(registerGeo, { name: "geo" });
export default GeoPlugin;
