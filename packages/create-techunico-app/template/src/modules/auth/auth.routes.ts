import { FastifyInstance } from 'fastify'
import { AuthController } from './auth.controller'
import { authGuard } from '@/core/auth.guard'

export async function authRoutes(app: FastifyInstance) {
  const controller = new AuthController()

  app.post('/register', controller.register.bind(controller))
  app.post('/login', controller.login.bind(controller))

  app.get(
    '/me',
    { preHandler: [authGuard] },
    async (req, reply) => {
      return reply.success(req.ctx.user)
    }
  )
}