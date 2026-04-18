import { FastifyInstance } from 'fastify'
import { registerPlugins } from '@/plugins'

export async function setupPlugins(app: FastifyInstance) {
  await registerPlugins(app)
}