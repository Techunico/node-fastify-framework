import { parseEnv } from "./env";
import { EnvConfig } from "./env.schema";

import { ConfigError } from "./env";

export { ConfigError };

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

    http: {
      trustProxy: parseTrustProxy(env.TRUST_PROXY),
      cors: {
        origins: parseOrigins(env.CORS_ORIGINS, env.NODE_ENV),
        credentials: env.CORS_CREDENTIALS,
      },
      rateLimit: {
        enabled: env.RATE_LIMIT_ENABLED,
        max: env.RATE_LIMIT_MAX,
        timeWindow: env.RATE_LIMIT_WINDOW,
        auth: { max: env.AUTH_RATE_LIMIT_MAX, timeWindow: env.AUTH_RATE_LIMIT_WINDOW },
      },
    },

    metrics: {
      enabled: env.METRICS_ENABLED,
      token: env.METRICS_TOKEN,
      public: env.METRICS_PUBLIC,
    },

    shutdown: {
      timeoutMs: env.SHUTDOWN_TIMEOUT_MS,
    },

    /** Raw environment for optional plugins' own config loaders. */
    source,
  };
}

export type AppConfig = ReturnType<typeof buildConfig>;

/** Same shape as Fastify's TrustProxyFunction (stable across Fastify 5.x typings). */
export type TrustProxySetting = boolean | string[] | ((address: string, hop: number) => boolean);

function parseTrustProxy(raw: string): TrustProxySetting {
  const value = raw.trim().toLowerCase();
  if (value === "" || value === "false") return false;
  if (value === "true") return true;
  if (/^\d+$/.test(value)) {
    // Trust the first N hops (proxy-addr semantics for a numeric setting).
    const hops = Number(value);
    return (_address: string, hop: number) => hop < hops;
  }
  return raw.split(",").map((entry) => entry.trim()).filter(Boolean);
}

/**
 * `null` disables CORS (same-origin only), `true` reflects any origin
 * (development default only), otherwise an explicit allowlist.
 */
function parseOrigins(raw: string | undefined, nodeEnv: string): string[] | true | null {
  if (raw === undefined) return nodeEnv === "development" ? true : null;
  const origins = raw.split(",").map((origin) => origin.trim()).filter(Boolean);
  if (origins.includes("*")) return true;
  return origins;
}

/** Rules that span several variables. */
function crossFieldIssues(env: EnvConfig): string[] {
  const issues: string[] = [];
  const production = env.NODE_ENV === "production";

  if (production && env.CORS_ORIGINS?.split(",").map((o) => o.trim()).includes("*")) {
    issues.push("CORS_ORIGINS: '*' is not allowed when NODE_ENV=production; list the allowed origins");
  }
  if (production && env.METRICS_ENABLED && !env.METRICS_TOKEN && !env.METRICS_PUBLIC) {
    issues.push(
      "METRICS_TOKEN: required when NODE_ENV=production and METRICS_ENABLED=true (or set METRICS_PUBLIC=true / METRICS_ENABLED=false)",
    );
  }
  if (env.JWT_ADMIN_SECRET && env.JWT_ADMIN_SECRET === env.JWT_SECRET) {
    issues.push("JWT_ADMIN_SECRET: must differ from JWT_SECRET");
  }
  return issues;
}

/**
 * Validates `source` (normally `process.env`, after the entry point loaded
 * `.env`) and returns the application configuration. Has no side effects:
 * nothing reads configuration at import time.
 */
export function loadConfig(source: NodeJS.ProcessEnv = process.env): AppConfig {
  const snapshot: EnvSource = Object.freeze({ ...source });
  const env = parseEnv(snapshot as NodeJS.ProcessEnv);
  const issues = crossFieldIssues(env);
  if (issues.length) throw new ConfigError(issues);
  return buildConfig(env, snapshot);
}
