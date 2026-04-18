import fp from 'fastify-plugin'
import { FastifyInstance } from 'fastify'

async function responsePlugin(app: FastifyInstance) {
  app.decorateReply('success', function (data: any, statusCode = 200) {
    this.status(statusCode).send({
      success: true,
      data,
      error: null,
    })
  })

  app.decorateReply('error', function (error: any, statusCode = 500) {
    this.status(statusCode).send({
      success: false,
      data: null,
      error,
    })
  })
}

export default fp(responsePlugin)