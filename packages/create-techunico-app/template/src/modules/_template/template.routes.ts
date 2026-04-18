import { FastifyInstance } from 'fastify'
import { TemplateController } from './template.controller'

export async function templateRoutes(app: FastifyInstance) {
  const controller = new TemplateController()

  app.post('/', controller.create.bind(controller))

  app.get('/', controller.findAll.bind(controller))
}
