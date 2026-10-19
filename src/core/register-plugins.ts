import { FastifyInstance } from 'fastify'
import { registerPlugins, RegisterPluginsOptions } from '@/plugins'

export async function setupPlugins(app: FastifyInstance, options: RegisterPluginsOptions = {}) {
  await registerPlugins(app, options)
}
