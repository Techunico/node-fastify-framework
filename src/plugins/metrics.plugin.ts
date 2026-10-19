import fp from 'fastify-plugin'
import {
  httpRequestsTotal,
  httpRequestDuration,
  UNMATCHED_ROUTE,
} from '@/core/metrics'

const KNOWN_METHODS = new Set(['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'])

export default fp(async (app) => {
  if (!app.config.metrics.enabled) return

  app.addHook('onRequest', async (request) => {
    request.startTime = process.hrtime()
  })

  app.addHook('onResponse', async (request, reply) => {
    const diff = process.hrtime(request.startTime)
    const duration = diff[0] + diff[1] / 1e9

    // Route *pattern* only (e.g. /api/v1/user/:id); unmatched requests share
    // one label so scanners cannot create unbounded time series.
    const route = request.routeOptions.url ?? UNMATCHED_ROUTE
    const labels = {
      method: KNOWN_METHODS.has(request.method) ? request.method : 'OTHER',
      route,
      status: reply.statusCode,
    }

    httpRequestsTotal.inc(labels)
    httpRequestDuration.observe(labels, duration)
  })
}, { name: 'metrics' })
