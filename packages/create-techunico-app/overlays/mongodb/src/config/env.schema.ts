import { z } from "zod";

export const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),

  PORT: z.coerce.number().default(3000),

  DB_PROVIDER: z.literal("mongodb"),
  MONGO_URI: z.string().min(1),

  JWT_SECRET: z.string().min(10),

  LOG_LEVEL: z.enum(["info", "warn", "error", "debug"]).default("info"),
  API_PREFIX: z.string().default("/api"),
  API_VERSION: z.string().default("v1"),
  REDIS_HOST: z.string().default("127.0.0.1"),
  REDIS_PORT: z.coerce.number().default(6379),
  REDIS_PASSWORD: z.string().optional(),
  PLUGINS: z.string().default(""),

  // Geo (optional — PLUGINS=geo)
  GEO_PROVIDER: z.enum(["google", "tomtom"]).optional(),
  GEO_FALLBACK_PROVIDER: z.enum(["google", "tomtom"]).optional(),
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

  // Cloudinary (optional — PLUGINS=cloudinary)
  CLOUDINARY_CLOUD_NAME: z.string().default(""),
  CLOUDINARY_API_KEY: z.string().default(""),
  CLOUDINARY_API_SECRET: z.string().default(""),
  CLOUDINARY_DEFAULT_FOLDER: z.string().default("general"),
  CLOUDINARY_SECURE: z
    .enum(["true", "false"])
    .default("true")
    .transform((v) => v === "true"),

  // Payment (optional — PLUGINS=payment)
  PAYMENT_PROVIDER: z.enum(["razorpay", "mock"]).default("razorpay"),
  RAZORPAY_KEY_ID: z.string().default("rzp_test_dummy_key_id"),
  RAZORPAY_KEY_SECRET: z.string().default("dummy_razorpay_secret_not_for_live"),
  RAZORPAY_WEBHOOK_SECRET: z.string().default(""),
  PAYMENT_CURRENCY: z.string().default("INR"),
  PAYMENT_MOCK_STABLE_IDS: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),
});

export type EnvConfig = z.infer<typeof envSchema>;
