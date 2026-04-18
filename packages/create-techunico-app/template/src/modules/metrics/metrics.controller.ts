import { FastifyRequest, FastifyReply } from 'fastify'
import { metricsService } from './metrics.service'

export class metricsController {
  async findAll(request: FastifyRequest, reply: FastifyReply) {
    const service = new metricsService(request.server.prisma)
    const data = await service.findAll()

    return reply.success(data)
  }
}