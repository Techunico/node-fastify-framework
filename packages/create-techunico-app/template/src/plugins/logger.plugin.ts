import fp from 'fastify-plugin'
import { FastifyInstance } from 'fastify'
import pino from 'pino'
import { loggerConfig } from '../config/logger'

async function loggerPlugin(app: FastifyInstance) {
  const logger = pino(loggerConfig)

  // Decorate Fastify instance
  app.decorate('logger', logger)

  app.addHook('onRequest', async (request) => {
    request.log = logger
  })
}

export default fp(loggerPlugin)