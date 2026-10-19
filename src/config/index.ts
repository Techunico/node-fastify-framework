import { parseEnv } from "./env";
import { EnvConfig } from "./env.schema";

export { ConfigError } from "./env";

/** Environment record handed to plugin config loaders (validated per plugin, only when enabled). */
export type EnvSource = Readonly<Record<string, string | undefined>>;

export function buildConfig(env: EnvConfig, source: EnvSource = {}) {
  return {
    app: {
      env: env.NODE_ENV,
      host: env.HOST,
      port: env.PORT,
      api: {
        prefix: env.API_PREFIX,
        version: env.API_VERSION,
      },
      plugins: env.PLUGINS.split(",").map((p) => p.trim()).filter((p) => p.length > 0),
    },

    db:
      env.DB_PROVIDER === "postgresql"
        ? { provider: env.DB_PROVIDER, url: env.DATABASE_URL }
        : { provider: env.DB_PROVIDER, url: env.MONGO_URI },

    jwt: {
      secret: env.JWT_SECRET,
      adminSecret: env.JWT_ADMIN_SECRET,
      issuer: env.JWT_ISSUER,
      audience: env.JWT_AUDIENCE,
      accessTtl: env.JWT_ACCESS_TTL,
      refreshTtl: env.JWT_REFRESH_TTL,
    },

    log: {
      level: env.LOG_LEVEL,
    },

    /** Raw environment for optional plugins' own config loaders. */
    source,
  };
}

export type AppConfig = ReturnType<typeof buildConfig>;

/**
 * Validates `source` (normally `process.env`, after the entry point loaded
 * `.env`) and returns the application configuration. Has no side effects:
 * nothing reads configuration at import time.
 */
export function loadConfig(source: NodeJS.ProcessEnv = process.env): AppConfig {
  const snapshot: EnvSource = Object.freeze({ ...source });
  return buildConfig(parseEnv(snapshot as NodeJS.ProcessEnv), snapshot);
}
