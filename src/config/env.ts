import { envSchema, EnvConfig } from './env.schema'

function loadEnv(): EnvConfig {
  const parsed = envSchema.safeParse(process.env)

  if (!parsed.success) {
    console.error('❌ Invalid environment variables')
    console.error(parsed.error.format())
    process.exit(1)
  }

  return parsed.data
}

export const env = loadEnv()