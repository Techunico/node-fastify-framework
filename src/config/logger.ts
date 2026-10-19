import type { FastifyServerOptions } from 'fastify'
import type { AppConfig } from '@/config'
import { loggerRedaction } from '@/core/log-redaction'

export function buildLoggerOptions(config: AppConfig): FastifyServerOptions['logger'] {
  return {
    level: config.log.level,
    redact: loggerRedaction,

    transport:
      config.app.env === 'development'
        ? {
            target: 'pino-pretty',
            options: {
              colorize: true,
              translateTime: 'HH:MM:ss',
              ignore: 'pid,hostname',
            },
          }
        : undefined,
  }
}
