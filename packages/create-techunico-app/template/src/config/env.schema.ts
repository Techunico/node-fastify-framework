import { z } from "zod";

export const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),

  PORT: z.coerce.number().default(3000),

  DATABASE_URL: z.string().min(1),

  JWT_SECRET: z.string().min(10),

  LOG_LEVEL: z.enum(["info", "warn", "error", "debug"]).default("info"),
  API_PREFIX: z.string().default("/api"),
  API_VERSION: z.string().default("v1"),
});

export type EnvConfig = z.infer<typeof envSchema>;
