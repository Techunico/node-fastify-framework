import { FastifyInstance } from 'fastify'
import { metricsRoutes } from './metrics.routes'

export async function metricsModule(app: FastifyInstance) {
  await app.register(metricsRoutes)
}