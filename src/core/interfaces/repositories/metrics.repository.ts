export interface IMetricsRepository {
  findAll(): Promise<unknown[]>;
}