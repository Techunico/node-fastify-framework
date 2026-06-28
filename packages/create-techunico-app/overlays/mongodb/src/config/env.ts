import { envSchema, EnvConfig } from "./env.schema";

function loadEnv(): EnvConfig {
  const rawEnv = { ...process.env };

  if ((rawEnv.NODE_ENV ?? "development") === "test") {
    rawEnv.MONGO_URI ??= "mongodb://localhost:27017/nodejs_framework_test";
    rawEnv.DB_PROVIDER ??= "mongodb";
    rawEnv.JWT_SECRET ??= "test-secret-12345";
    rawEnv.REDIS_HOST ??= "127.0.0.1";
    rawEnv.REDIS_PORT ??= "6379";
    rawEnv.PLUGINS ??= "";
  }

  const parsed = envSchema.safeParse(rawEnv);

  if (!parsed.success) {
    console.error("❌ Invalid environment variables");
    console.error(parsed.error.format());
    throw new Error("Invalid environment variables");
  }

  return parsed.data;
}

export const env = loadEnv();