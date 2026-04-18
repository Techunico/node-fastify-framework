import { FastifyRequest, FastifyReply } from 'fastify'
import { AuthService } from './auth.service'

export class AuthController {

  async register(request: FastifyRequest, reply: FastifyReply) {

    const service = new AuthService(request.server.prisma)

    const user = await service.register(request.body as any)

    return reply.success(user)
  }

  async login(request: FastifyRequest, reply: FastifyReply) {
    const service = new AuthService(request.server.prisma)

    const { email, password } = request.body as any

    const user = await service.login(email, password)

    const token = request.server.jwt.sign({ id: user.id })

    return reply.success({ user, token })
  }
}