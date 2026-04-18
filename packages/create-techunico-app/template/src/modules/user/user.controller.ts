import { FastifyRequest, FastifyReply } from 'fastify'
import { UserService } from './user.service'

export class UserController {
  async getUsers(request: FastifyRequest, reply: FastifyReply) {
    const service = new UserService(request.server.prisma)

    const users = await service.getAllUsers()

    return reply.send({
      success: true,
      data: users,
    })
  }

  // async createUser(request: FastifyRequest, reply: FastifyReply) {
  //   const service = new UserService(request.server.prisma)

  //   const data = request.body as {
  //     name: string
  //     email: string
  //     password:string
  //   }

  //   const user = await service.createUser(data)

  //   return reply.send({
  //     success: true,
  //     data: user,
  //   })
  // }
}