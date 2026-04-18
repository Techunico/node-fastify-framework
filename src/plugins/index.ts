import { FastifyInstance } from "fastify";
import dbPlugin from "./db.plugin";
import responsePlugin from "./response.plugin";
import contextPlugin from "./context.plugin";
import servicesPlugin from "./services.plugin";
import jwtPlugin from "./jwt.plugin";
import metricsPlugin from "./metrics.plugin";

export async function registerPlugins(app: FastifyInstance) {
  await app.register(dbPlugin);
  await app.register(jwtPlugin);
  await app.register(responsePlugin);
  await app.register(metricsPlugin);
  await app.register(contextPlugin);
  await app.register(servicesPlugin);
}
