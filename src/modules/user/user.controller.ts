import { FastifyRequest, FastifyReply } from "fastify";
import { PrismaClient } from "@/generated/prisma/client";
import { UserService } from "./user.service";

export class UserController {
  async getUsers(request: FastifyRequest, reply: FastifyReply) {
    const prisma = request.server.db.getClient() as PrismaClient;
    const service = new UserService(prisma);
    const users = await service.getAllUsers();

    return reply.send({
      success: true,
      data: users,
    });
  }
}