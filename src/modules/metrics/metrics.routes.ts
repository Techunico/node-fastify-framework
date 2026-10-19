import { timingSafeEqual } from 'crypto'
import { FastifyInstance } from 'fastify'
import { register } from '@/core/metrics'
import { AppError } from '@/utils/app-error'

function tokenMatches(header: string | undefined, token: string): boolean {
  const expected = Buffer.from(`Bearer ${token}`)
  const received = Buffer.from(header ?? '')
  return expected.length === received.length && timingSafeEqual(expected, received)
}

export async function metricsRoutes(app: FastifyInstance) {
  const { metrics } = app.config
  if (!metrics.enabled) return

  app.get('/metrics', async (request, reply) => {
    // Production requires a token unless METRICS_PUBLIC=true (enforced at config load).
    if (metrics.token && !tokenMatches(request.headers.authorization, metrics.token)) {
      throw new AppError('Unauthorized', 401, 'UNAUTHORIZED')
    }

    reply.header('Content-Type', register.contentType)
    return register.metrics()
  })
}
