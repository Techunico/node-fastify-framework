import { CloudinaryError, CloudinaryNotConfiguredError } from "./errors";
import type { CloudinaryPluginConfig } from "./types";

type EnvSource = Readonly<Record<string, string | undefined>>;

/**
 * Reads Cloudinary credentials from the environment.
 *
 * CLOUDINARY_CLOUD_NAME / CLOUDINARY_API_KEY / CLOUDINARY_API_SECRET
 * CLOUDINARY_DEFAULT_FOLDER (optional, default: "general")
 * CLOUDINARY_SECURE (optional, default: true)
 */
export function loadCloudinaryConfig(env: EnvSource): CloudinaryPluginConfig {
  const value = (name: string): string => env[name]?.trim() ?? "";
  return {
    cloudName: value("CLOUDINARY_CLOUD_NAME"),
    apiKey: value("CLOUDINARY_API_KEY"),
    apiSecret: value("CLOUDINARY_API_SECRET"),
    defaultFolder: value("CLOUDINARY_DEFAULT_FOLDER") || "general",
    secure: value("CLOUDINARY_SECURE") !== "false",
  };
}

export function isCloudinaryConfigured(config: CloudinaryPluginConfig): boolean {
  return Boolean(config.cloudName && config.apiKey && config.apiSecret);
}

export function assertCloudinaryConfigured(config: CloudinaryPluginConfig): void {
  if (!isCloudinaryConfigured(config)) {
    throw new CloudinaryNotConfiguredError();
  }
  if (config.cloudName.length < 2) {
    throw new CloudinaryError("CLOUDINARY_CLOUD_NAME is invalid");
  }
}
