import { FastifyRequest, FastifyReply } from 'fastify'
import { TemplateService } from './template.service'
import { validate } from '@/utils/validate'
import { createTemplateSchema } from './template.schema'

export class TemplateController {
  async create(request: FastifyRequest, reply: FastifyReply) {
    const data = validate(createTemplateSchema, request.body)

    const service = new TemplateService(request.server.prisma)
    const result = await service.create(data)

    return reply.success(result)
  }

  async findAll(request: FastifyRequest, reply: FastifyReply) {
    const service = new TemplateService(request.server.prisma)
    const result = await service.findAll()

    return reply.success(result)
  }
}