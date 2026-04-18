import { FastifyInstance } from 'fastify'
import { AuthController } from './auth.controller'
import { authGuard } from '@/core/auth.guard'
import { validateBody } from '@/core/validation.middleware'
import { loginSchema, registerSchema } from './auth.schema'

export async function authRoutes(app: FastifyInstance) {
  const controller = new AuthController()

  app.post(
    '/register',
    { preHandler: [validateBody(registerSchema)] },
    controller.register.bind(controller)
  )
  app.post(
    '/login',
    { preHandler: [validateBody(loginSchema)] },
    controller.login.bind(controller)
  )

  app.get(
    '/me',
    { preHandler: [authGuard] },
    async (req, reply) => {
      return reply.success(req.ctx.user)
    }
  )
}
