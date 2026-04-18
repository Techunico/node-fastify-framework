import fp from 'fastify-plugin'
import { FastifyInstance } from 'fastify'

import { PrismaClient } from '@/generated/prisma/client'
import pg from 'pg'
import { PrismaPg } from '@prisma/adapter-pg'

async function dbPlugin(app:FastifyInstance) {
  const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
  })

  const adapter = new PrismaPg(pool)

  const prisma = new PrismaClient({ adapter })

  await prisma.$connect()

  app.decorate('prisma', prisma)

  app.addHook('onClose', async () => {
    await prisma.$disconnect()
    await pool.end()
  })
}

export default fp(dbPlugin)