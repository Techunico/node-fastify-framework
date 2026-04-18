import { FastifyInstance } from "fastify";
import loggerPlugin from "./logger.plugin";
import dbPlugin from "./db.plugin";
import responsePlugin from "./response.plugin";
import contextPlugin from "./context.plugin";
import servicesPlugin from "./services.plugin";

export async function registerPlugins(app: FastifyInstance) {
  // Plugins will be registered here
  await loggerPlugin(app);
  await app.register(dbPlugin);
  await app.register(responsePlugin);
  await app.register(contextPlugin);
  await app.register(servicesPlugin);
}
