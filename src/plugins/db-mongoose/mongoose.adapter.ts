import mongoose from "mongoose";
import {
  DatabaseAdapter,
  HealthCheckResult,
} from "@/core/interfaces/database";
import { MongooseMetricsRepository } from "./repositories/mongoose-metrics.repository";
import { MongooseUserRepository } from "./repositories/mongoose-user.repository";

export class MongooseDatabaseAdapter implements DatabaseAdapter {
  readonly repositories = {
    user: new MongooseUserRepository(),
    metrics: new MongooseMetricsRepository(),
  };

  constructor(private readonly uri: string) {}

  async connect(): Promise<void> {
    if (!this.uri) {
      throw new Error("MONGO_URI is not defined");
    }

    await mongoose.connect(this.uri);
  }

  async disconnect(): Promise<void> {
    await mongoose.disconnect();
  }

  async healthCheck(): Promise<HealthCheckResult> {
    const readyState = mongoose.connection.readyState;

    if (readyState === 1) {
      return { status: "ok" };
    }

    return {
      status: "fail",
      message: "Database not connected",
    };
  }
}