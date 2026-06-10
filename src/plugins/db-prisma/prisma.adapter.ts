import { PrismaClient } from '@prisma/client'
import { DatabaseAdapter } from '@/core/interfaces/database'

export class PrismaAdapter implements DatabaseAdapter {
  private client = new PrismaClient()

  async connect() {
    await this.client.$connect()
  }

  async disconnect() {
    await this.client.$disconnect()
  }

  getClient() {
    return this.client
  }
}