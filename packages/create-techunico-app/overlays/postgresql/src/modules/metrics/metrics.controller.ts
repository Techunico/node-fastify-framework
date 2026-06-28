import { FastifyRequest, FastifyReply } from "fastify";
import { PrismaClient } from "@/generated/prisma/client";
import { metricsService } from "./metrics.service";

export class metricsController {
  async findAll(request: FastifyRequest, reply: FastifyReply) {
    const prisma = request.server.db.getClient() as PrismaClient;
    const service = new metricsService(prisma);
    const data = await service.findAll();

    return reply.success(data);
  }
}