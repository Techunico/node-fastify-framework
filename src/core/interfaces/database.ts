import type { IMetricsRepository } from "./repositories/metrics.repository";
import type { IUserRepository } from "./repositories/user.repository";

export interface HealthCheckResult {
  status: "ok" | "fail";
  message?: string;
}

export interface DatabaseRepositories {
  user: IUserRepository;
  metrics: IMetricsRepository;
}

export interface DatabaseAdapter {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  healthCheck(): Promise<HealthCheckResult>;
  repositories: DatabaseRepositories;
}