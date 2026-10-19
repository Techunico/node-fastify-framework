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

export const secret = (name: string) =>
  z
    .string({ error: `${name} is required` })
    .refine((value) => !isWeakSecret(value), {
      message: `${name} must be a random value of at least ${MIN_SECRET_LENGTH} characters (placeholders are rejected). Generate one with: node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"`,
    });

const booleanString = (fallback: "true" | "false") =>
  z
    .preprocess(blankToUndefined, z.enum(["true", "false"]).default(fallback))
    .transform((value) => value === "true");

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

  // ─── Redis (used when PLUGINS includes redis) ────────────────────────────
  REDIS_HOST: z.string().default("127.0.0.1"),
  REDIS_PORT: z.coerce.number().int().positive().default(6379),
  REDIS_PASSWORD: optional(z.string()),

  // ─── Geo plugin (optional — enable with PLUGINS=geo) ─────────────────────
  GEO_PROVIDER: optional(z.enum(["google", "tomtom"])),
  GEO_FALLBACK_PROVIDER: optional(z.enum(["google", "tomtom"])),
  GOOGLE_MAPS_API_KEY: z.string().default(""),
  GOOGLE_MAPS_BASE_URL: z.string().default(""),
  GOOGLE_ROUTES_BASE_URL: z.string().default(""),
  GOOGLE_PLACES_BASE_URL: z.string().default(""),
  GOOGLE_ROADS_BASE_URL: z.string().default(""),
  TOMTOM_API_KEY: z.string().default(""),
  TOMTOM_BASE_URL: z.string().default(""),
  GEO_REQUEST_TIMEOUT_MS: z.coerce.number().int().nonnegative().default(5000),
  GEO_REQUEST_RETRIES: z.coerce.number().int().nonnegative().default(2),
  GEO_RETRY_DELAY_MS: z.coerce.number().int().nonnegative().default(200),

  // ─── Cloudinary plugin (optional — enable with PLUGINS=cloudinary) ───────
  CLOUDINARY_CLOUD_NAME: z.string().default(""),
  CLOUDINARY_API_KEY: z.string().default(""),
  CLOUDINARY_API_SECRET: z.string().default(""),
  CLOUDINARY_DEFAULT_FOLDER: z.string().default("general"),
  CLOUDINARY_SECURE: booleanString("true"),

  // ─── Payment plugin (optional — enable with PLUGINS=payment) ─────────────
  PAYMENT_PROVIDER: optional(z.enum(["razorpay", "mock"])),
  RAZORPAY_KEY_ID: z.string().default(""),
  RAZORPAY_KEY_SECRET: z.string().default(""),
  RAZORPAY_WEBHOOK_SECRET: z.string().default(""),
  PAYMENT_CURRENCY: z.string().default("INR"),
  PAYMENT_MOCK_STABLE_IDS: booleanString("false"),
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
