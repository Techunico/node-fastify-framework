import { envSchema, EnvConfig } from './env.schema'

export class ConfigError extends Error {
  constructor(public readonly issues: string[]) {
    super(`Invalid environment variables:\n  - ${issues.join('\n  - ')}`)
    this.name = 'ConfigError'
  }
}

/** Validates an environment record. Never prints values, only variable names and reasons. */
export function parseEnv(source: NodeJS.ProcessEnv): EnvConfig {
  const parsed = envSchema.safeParse(source)

  if (!parsed.success) {
    const issues = parsed.error.issues.map((issue) => {
      const key = issue.path.join('.') || '(root)'
      return `${key}: ${issue.message}`
    })
    throw new ConfigError(issues)
  }

  return parsed.data
}

export const env = parseEnv(process.env)
