import fp from 'fastify-plugin'
import {
  httpRequestsTotal,
  httpRequestDuration,
} from '@/core/metrics'

export default fp(async (app) => {
  app.addHook('onRequest', async (request) => {
    request.startTime = process.hrtime()
  })

  app.addHook('onResponse', async (request, reply) => {
    const diff = process.hrtime(request.startTime)
    const duration = diff[0] + diff[1] / 1e9

    const route = request.routeOptions?.url ?? request.url

    httpRequestsTotal.inc({
      method: request.method,
      route,
      status: reply.statusCode,
    })

    httpRequestDuration.observe(
      {
        method: request.method,
        route,
        status: reply.statusCode,
      },
      duration
    )
  })
})
