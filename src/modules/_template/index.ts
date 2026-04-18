import { FastifyInstance } from 'fastify'
import { templateRoutes } from './template.routes'

export async function templateModule(app: FastifyInstance) {
  await app.register(templateRoutes)
}