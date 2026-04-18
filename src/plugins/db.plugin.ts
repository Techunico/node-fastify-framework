import fp from 'fastify-plugin'
import { FastifyInstance } from 'fastify'

import { PrismaClient } from '@/generated/prisma/client'
import { config } from '@/config'
import pg from 'pg'
import { PrismaPg } from '@prisma/adapter-pg'

async function dbPlugin(app:FastifyInstance) {
  const pool = new pg.Pool({
    connectionString: config.db.url,
  })

  const adapter = new PrismaPg(pool)

  const prisma = new PrismaClient({ adapter })

  app.decorate('prisma', prisma)

  app.addHook('onClose', async () => {
    await prisma.$disconnect()
    await pool.end()
  })
}

export default fp(dbPlugin)
