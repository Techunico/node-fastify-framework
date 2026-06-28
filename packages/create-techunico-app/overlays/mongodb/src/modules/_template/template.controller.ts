import { FastifyRequest, FastifyReply } from "fastify";
import { TemplateService } from "./template.service";

export class TemplateController {
  async create(request: FastifyRequest, reply: FastifyReply) {
    const service = new TemplateService(request.ctx);
    const data = await service.create(request.body as any);

    return reply.success(data);
  }

  async findAll(request: FastifyRequest, reply: FastifyReply) {
    const service = new TemplateService(request.ctx);
    const data = await service.findAll();

    return reply.success(data);
  }
}