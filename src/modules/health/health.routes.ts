import { FastifyInstance } from 'fastify'

export async function healthRoutes(app: FastifyInstance) {
  // Liveness
  app.get('/health', async (request, reply) => {
    return reply.success({
      status: 'ok',
      uptime: process.uptime(),
      timestamp: Date.now(),
    })
  })

  // Readiness
  app.get('/ready', async (request, reply) => {
    try {
      await request.server.prisma.$queryRaw`SELECT 1`

      return reply.success({
        status: 'ready',
      })
    } catch (error) {
      request.log.error(error)

      return reply.status(500).send({
        success: false,
        data: null,
        error: {
          type: 'NOT_READY',
          message: 'Database not ready',
        },
      })
    }
  })
}