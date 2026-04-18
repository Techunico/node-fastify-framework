import { FastifyInstance } from 'fastify'
import { register } from '@/core/metrics'

export async function metricsRoutes(app: FastifyInstance) {
  app.get('/metrics', async (request, reply) => {
    reply.header('Content-Type', register.contentType)
    return register.metrics()
  })
}