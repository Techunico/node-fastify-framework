import { envSchema, EnvConfig } from '../config/env.schema'

export function loadConfig() {
  const parsed = envSchema.parse(process.env);
  return parsed;
}