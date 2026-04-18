import { FastifyRequest, FastifyReply } from 'fastify'
import { HealthService } from './health.service'

const healthService = new HealthService()

export class HealthController {
  async check(request: FastifyRequest, reply: FastifyReply) {
    request.log.info('Health check triggered')

    const data = healthService.getStatus()

    return reply.send({
      success: true,
      data,
    })
  }
}