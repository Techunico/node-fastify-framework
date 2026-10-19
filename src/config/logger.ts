import { config } from '@/config'
import { loggerRedaction } from '@/core/log-redaction'

export const loggerConfig = {
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
