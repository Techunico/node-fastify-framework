import { PrismaClient } from '@/generated/prisma/client'
import { metricsRepository } from './metrics.repository'

export class metricsService {
  private repo: metricsRepository

  constructor(prisma: PrismaClient) {
    this.repo = new metricsRepository(prisma)
  }

  async findAll() {
    return this.repo.findAll()
  }
}