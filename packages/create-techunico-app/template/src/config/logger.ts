import { config } from '@/config'

export const loggerConfig = {
  level: config.log.level,

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