import { z } from "zod";

const blankToUndefined = (value: unknown) =>
  typeof value === "string" && value.trim() === "" ? undefined : value;

const redisEnvSchema = z.object({
  REDIS_HOST: z.preprocess(blankToUndefined, z.string().default("127.0.0.1")),
  REDIS_PORT: z.preprocess(blankToUndefined, z.coerce.number().int().positive().default(6379)),
  REDIS_PASSWORD: z.preprocess(blankToUndefined, z.string().optional()),
  REDIS_CONNECT_TIMEOUT_MS: z.preprocess(blankToUndefined, z.coerce.number().int().positive().default(5_000)),
  REDIS_MAX_RETRIES_PER_REQUEST: z.preprocess(blankToUndefined, z.coerce.number().int().nonnegative().default(2)),
});

export interface RedisPluginConfig {
  host: string;
  port: number;
  password?: string;
  connectTimeoutMs: number;
  maxRetriesPerRequest: number;
}

/** Validates REDIS_* variables. Called only when the redis plugin is enabled. */
export function loadRedisConfig(env: Readonly<Record<string, string | undefined>>): RedisPluginConfig {
  const parsed = redisEnvSchema.safeParse(env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`);
    throw new Error(`Invalid redis configuration: ${issues.join("; ")}`);
  }
  return {
    host: parsed.data.REDIS_HOST,
    port: parsed.data.REDIS_PORT,
    password: parsed.data.REDIS_PASSWORD,
    connectTimeoutMs: parsed.data.REDIS_CONNECT_TIMEOUT_MS,
    maxRetriesPerRequest: parsed.data.REDIS_MAX_RETRIES_PER_REQUEST,
  };
}
