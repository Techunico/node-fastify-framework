import { PrismaClient } from "@/generated/prisma/client";
import { IMetricsRepository } from "@/core/interfaces/repositories/metrics.repository";

export class PrismaMetricsRepository implements IMetricsRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findAll(): Promise<unknown[]> {
    void this.prisma;
    return [];
  }
}