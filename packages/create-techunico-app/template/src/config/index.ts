import { env } from "./env";

export const config = {
  app: {
    env: env.NODE_ENV,
    port: env.PORT,
    api: {
      prefix: env.API_PREFIX,
      version: env.API_VERSION,
    },
  },

  db: {
    url: env.DATABASE_URL,
  },

  jwt: {
    secret: env.JWT_SECRET,
  },

  log: {
    level: env.LOG_LEVEL,
  },
};
