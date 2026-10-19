import { FastifyInstance, FastifyPluginAsync } from "fastify";
import fp from "fastify-plugin";
import { CloudinaryService } from "./cloudinary.service";
import {
  isCloudinaryConfigured,
  loadCloudinaryConfig,
} from "./config";
import { CloudinaryNotConfiguredError } from "./errors";
import type { CloudinaryPluginConfig } from "./types";

export interface CloudinaryPluginOptions {
  config?: CloudinaryPluginConfig;
  /**
   * When true (default), missing credentials throw at registration.
   * Set false only for tests that stub the decorator.
   */
  requireConfigured?: boolean;
}

declare module "fastify" {
  interface FastifyInstance {
    /** Present when PLUGINS includes cloudinary. */
    cloudinary?: CloudinaryService;
  }
}

const registerCloudinary: FastifyPluginAsync<CloudinaryPluginOptions> = async (
  app: FastifyInstance,
  options: CloudinaryPluginOptions,
): Promise<void> => {
  const config = options.config ?? loadCloudinaryConfig();
  const requireConfigured = options.requireConfigured !== false;

  if (!isCloudinaryConfigured(config)) {
    if (requireConfigured) {
      throw new CloudinaryNotConfiguredError(
        'Cloudinary plugin enabled but credentials missing. Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET — or remove "cloudinary" from PLUGINS.',
      );
    }
    app.log.warn("Cloudinary credentials missing — service will reject operations");
  }

  const service = new CloudinaryService(config, app.log);
  app.decorate("cloudinary", service);

  app.log.info(
    {
      configured: service.isConfigured(),
      cloudName: config.cloudName ? `${config.cloudName.slice(0, 3)}…` : null,
      defaultFolder: config.defaultFolder,
    },
    "Cloudinary plugin registered",
  );
};

export const CloudinaryPlugin = fp(registerCloudinary, { name: "cloudinary" });
export default CloudinaryPlugin;
