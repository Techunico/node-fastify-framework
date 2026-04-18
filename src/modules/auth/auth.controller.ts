import { FastifyRequest, FastifyReply } from 'fastify'
import { LoginInput, RegisterInput } from './auth.schema'

export class AuthController {
  async register(request: FastifyRequest, reply: FastifyReply) {
    const user = await request.services.auth.register(request.body as RegisterInput)

    return reply.success(user)
  }

  async login(request: FastifyRequest, reply: FastifyReply) {
    const { email, password } = request.body as LoginInput
    const user = await request.services.auth.login(email, password)
    const token = request.server.jwt.sign({
      id: user.id,
      role: user.role,
      permissions: user.permissions,
    })

    return reply.success({ user, token })
  }
}
