import { FastifyInstance } from 'fastify'
import { userModule } from '@/modules/user'
import { healthModule } from '@/modules/health'

export async function registerModules(app: FastifyInstance) {
  await app.register(healthModule, { prefix: '/api/health' })
  await app.register(userModule, { prefix: '/api' })
}