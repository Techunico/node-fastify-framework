import { FastifyInstance } from 'fastify'
import { authRoutes } from './auth.routes'

export async function authModule(app: FastifyInstance) {
  await app.register(authRoutes)
}