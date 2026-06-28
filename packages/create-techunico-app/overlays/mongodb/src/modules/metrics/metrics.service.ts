import { metricsRepository } from "./metrics.repository";

export class metricsService {
  private repo = new metricsRepository();

  async findAll() {
    return this.repo.findAll();
  }
}