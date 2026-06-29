import { DatabaseAdapter } from "@/core/interfaces/database";

export class metricsService {
  constructor(private readonly db: DatabaseAdapter) {}

  async findAll() {
    return this.db.repositories.metrics.findAll();
  }
}