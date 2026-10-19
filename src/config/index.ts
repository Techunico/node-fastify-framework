import { env } from "./env";
import { EnvConfig } from "./env.schema";

export function buildConfig(source: EnvConfig) {
  return {
    app: {
      env: source.NODE_ENV,
      host: source.HOST,
      port: source.PORT,
      api: {
        prefix: source.API_PREFIX,
        version: source.API_VERSION,
      },
      plugins: source.PLUGINS.split(",").map((p) => p.trim()).filter((p) => p.length > 0),
    },

    db:
      source.DB_PROVIDER === "postgresql"
        ? { provider: source.DB_PROVIDER, url: source.DATABASE_URL }
        : { provider: source.DB_PROVIDER, url: source.MONGO_URI },

    jwt: {
      secret: source.JWT_SECRET,
      adminSecret: source.JWT_ADMIN_SECRET,
      issuer: source.JWT_ISSUER,
      audience: source.JWT_AUDIENCE,
      accessTtl: source.JWT_ACCESS_TTL,
      refreshTtl: source.JWT_REFRESH_TTL,
    },

    log: {
      level: source.LOG_LEVEL,
    },

    redis: {
      host: source.REDIS_HOST,
      port: source.REDIS_PORT,
      password: source.REDIS_PASSWORD,
    },
  };
}

export type AppConfig = ReturnType<typeof buildConfig>;

export const config = buildConfig(env);
