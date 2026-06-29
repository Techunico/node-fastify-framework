import { IMetricsRepository } from "@/core/interfaces/repositories/metrics.repository";

export class MongooseMetricsRepository implements IMetricsRepository {
  async findAll(): Promise<unknown[]> {
    return [];
  }
}