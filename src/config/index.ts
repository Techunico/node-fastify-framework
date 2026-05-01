import { env } from "./env";

export const config = {
  app: {
    env: env.NODE_ENV,
    port: env.PORT,
    api: {
      prefix: env.API_PREFIX,
      version: env.API_VERSION,
    },
    plugins: env.PLUGINS.split(",").map(p => p.trim()).filter(p => p.length > 0), 
  },

  db: {
    url: env.DATABASE_URL,
    provider: env.DB_PROVIDER,
  },

  jwt: {
    secret: env.JWT_SECRET,
  },

  log: {
    level: env.LOG_LEVEL,
  },
  redis: {
    host: env.REDIS_HOST,
    port: env.REDIS_PORT,
    password: env.REDIS_PASSWORD,
  },
};
