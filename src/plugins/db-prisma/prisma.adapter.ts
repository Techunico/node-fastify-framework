import { PrismaClient } from "@/generated/prisma/client";
import {
  DatabaseAdapter,
  HealthCheckResult,
} from "@/core/interfaces/database";
import { PrismaMetricsRepository } from "./repositories/prisma-metrics.repository";
import { PrismaUserRepository } from "./repositories/prisma-user.repository";

export class PrismaDatabaseAdapter implements DatabaseAdapter {
  readonly repositories;

  constructor(private readonly prisma: PrismaClient) {
    this.repositories = {
      user: new PrismaUserRepository(prisma),
      metrics: new PrismaMetricsRepository(prisma),
    };
  }

  async connect(): Promise<void> {
    await this.prisma.$connect();
  }

  async disconnect(): Promise<void> {
    await this.prisma.$disconnect();
  }

  async healthCheck(): Promise<HealthCheckResult> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { status: "ok" };
    } catch (error) {
      return {
        status: "fail",
        message:
          error instanceof Error ? error.message : "Database unreachable",
      };
    }
  }
}