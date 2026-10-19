import fp from 'fastify-plugin'
import { FastifyInstance, FastifyReply } from 'fastify'

async function responsePlugin(app: FastifyInstance) {
  app.decorateReply('success', function (this: FastifyReply, data: unknown, statusCode = 200) {
    return this.status(statusCode).send({
      success: true,
      data,
      error: null,
    })
  })

  app.decorateReply('error', function (this: FastifyReply, error: unknown, statusCode = 500) {
    return this.status(statusCode).send({
      success: false,
      data: null,
      error,
    })
  })
}

export default fp(responsePlugin, { name: 'response' })
