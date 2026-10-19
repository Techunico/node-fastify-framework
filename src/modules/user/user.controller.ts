import { FastifyRequest, FastifyReply } from "fastify";

export class UserController {
  async getUsers(request: FastifyRequest, reply: FastifyReply) {
    const users = await request.services.users.getAllUsers();

    return reply.success(users);
  }
}
