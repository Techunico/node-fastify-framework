import { PrismaClient } from '@/generated/prisma/client'

export class metricsRepository {
  constructor(private prisma: PrismaClient) {}

  async findAll() {
    return []
  }
}