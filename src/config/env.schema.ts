import { z } from "zod";

/** Treat empty strings (e.g. `KEY=` in .env) as "not set". */
const blankToUndefined = (value: unknown) =>
  typeof value === "string" && value.trim() === "" ? undefined : value;

const optional = <T extends z.ZodType>(schema: T) =>
  z.preprocess(blankToUndefined, schema.optional());

/**
 * Values that have shipped in templates or are commonly copy-pasted. A secret
 * matching any of these is rejected regardless of length.
 */
const KNOWN_PLACEHOLDER_SECRETS = [
  "supersecuresecret",
  "secret",
  "secret_admin",
  "secret_user",
  "changeme",
  "change-me",
  "your-secret",
  "your_secret",
  "jwt_secret",
  "test-secret-12345",
];

export const MIN_SECRET_LENGTH = 32;

export function isWeakSecret(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  if (normalized.length < MIN_SECRET_LENGTH) return true;
  if (KNOWN_PLACEHOLDER_SECRETS.some((placeholder) => normalized.includes(placeholder))) {
    return true;
  }
  // Low-entropy values such as "aaaa…" or "abababab…".
  return new Set(normalized).size < 8;
}

const booleanString = (fallback: "true" | "false") =>
  z
    .preprocess(blankToUndefined, z.enum(["true", "false"]).default(fallback))
    .transform((value) => value === "true");

export const secret = (name: string) =>
  z
    .string({ error: `${name} is required` })
    .refine((value) => !isWeakSecret(value), {
      message: `${name} must be a random value of at least ${MIN_SECRET_LENGTH} characters (placeholders are rejected). Generate one with: node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"`,
    });

/**
 * Core settings only. Optional plugins (redis, geo, cloudinary, payment, …)
 * validate their own variables when — and only when — they are enabled.
 */
const baseSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3000),
  HOST: z.string().default("0.0.0.0"),

  LOG_LEVEL: z
    .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
    .default("info"),
  API_PREFIX: z.string().default("/api"),
  API_VERSION: z.string().default("v1"),
  PLUGINS: z.string().default(""),

  // ─── Authentication ──────────────────────────────────────────────────────
  JWT_SECRET: secret("JWT_SECRET"),
  JWT_ADMIN_SECRET: optional(secret("JWT_ADMIN_SECRET")),
  JWT_ISSUER: z.string().min(1).default("techunico"),
  JWT_AUDIENCE: z.string().min(1).default("techunico-api"),
  JWT_ACCESS_TTL: z.string().min(1).default("15m"),
  JWT_REFRESH_TTL: z.string().min(1).default("30d"),

  // ─── HTTP hardening ──────────────────────────────────────────────────────
  /** false | true | <hop count> | comma-separated proxy IPs/CIDRs */
  TRUST_PROXY: z.string().default("false"),
  /** Comma-separated allowed origins. Unset: no CORS in production, any origin in development. */
  CORS_ORIGINS: optional(z.string()),
  CORS_CREDENTIALS: booleanString("false"),
  RATE_LIMIT_ENABLED: booleanString("true"),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(300),
  RATE_LIMIT_WINDOW: z.string().min(1).default("1 minute"),
  /** Stricter limit for /auth/login and /auth/register (per client IP). */
  AUTH_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(10),
  AUTH_RATE_LIMIT_WINDOW: z.string().min(1).default("1 minute"),

  // ─── Metrics ─────────────────────────────────────────────────────────────
  METRICS_ENABLED: booleanString("true"),
  /** Bearer token required to read /metrics. Required in production unless METRICS_PUBLIC=true. */
  METRICS_TOKEN: optional(z.string().min(16, "METRICS_TOKEN must be at least 16 characters")),
  METRICS_PUBLIC: booleanString("false"),

  // ─── Lifecycle ───────────────────────────────────────────────────────────
  SHUTDOWN_TIMEOUT_MS: z.coerce.number().int().positive().default(10_000),
});

const databaseSchema = z.discriminatedUnion("DB_PROVIDER", [
  z.object({
    DB_PROVIDER: z.literal("postgresql"),
    DATABASE_URL: z.string().min(1, "DATABASE_URL is required when DB_PROVIDER=postgresql"),
  }),
  z.object({
    DB_PROVIDER: z.literal("mongodb"),
    MONGO_URI: z.string().min(1, "MONGO_URI is required when DB_PROVIDER=mongodb"),
  }),
]);

export const envSchema = z.intersection(baseSchema, databaseSchema);

export type EnvConfig = z.infer<typeof envSchema>;
export type DbProvider = EnvConfig["DB_PROVIDER"];
