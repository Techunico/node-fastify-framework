import Fastify from "fastify";
import { setupPlugins } from "./core/register-plugins";
import { setupErrorHandler } from "./core/error-handler";
// import { registerModules } from "./core/register-modules"; // manual register
import { registerModules } from "@/core/module-loader"; //auto register
import { registerModels } from "@/core/model-loader";
import { loggerConfig } from "@/config/logger";
import { config } from "@/config";
// import { loadEventListeners } from "./events/event.loader";

export async function buildApp() {
  const app = Fastify({
    logger: loggerConfig,
  });
  await setupPlugins(app);
  await registerModules(app);

  // Side-effect import of *.model.ts|js after DB connect (Mongo only).
  if (config.db.provider === "mongodb") {
    await registerModels({ logger: app.log });
  }

  /**
   * this is an experimental feature
   * enabling this will allow you to use socket io in your application
   * but may behave unexpectedly
   */

  // await loadEventListeners(app.event);

  setupErrorHandler(app);
  return app;
}
