import { envSchema, EnvConfig } from './env.schema'

function loadEnv(): EnvConfig {
  const rawEnv = { ...process.env }

  if ((rawEnv.NODE_ENV ?? 'development') === 'test') {
    rawEnv.DATABASE_URL ??= 'postgresql://test:test@localhost:5432/nodejs_framework_test'
    rawEnv.JWT_SECRET ??= 'test-secret-12345'
  }

  const parsed = envSchema.safeParse(rawEnv)

  if (!parsed.success) {
    console.error('❌ Invalid environment variables')
    console.error(parsed.error.format())
    throw new Error('Invalid environment variables')
  }

  return parsed.data
}

export const env = loadEnv()
