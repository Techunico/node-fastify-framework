import { FastifyRequest, FastifyReply } from "fastify";
import { UserService } from "./user.service";

export class UserController {
  async getUsers(request: FastifyRequest, reply: FastifyReply) {
    const service = new UserService(request.server.db);
    const users = await service.getAllUsers();

    return reply.send({
      success: true,
      data: users,
    });
  }
}