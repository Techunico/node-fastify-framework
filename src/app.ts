import Fastify from "fastify";
import { setupPlugins } from "./core/register-plugins";
import { setupErrorHandler } from "./core/error-handler";
// import { registerModules } from "./core/register-modules"; // manual register
import { registerModules } from "@/core/module-loader"; //auto register
import { loggerConfig } from "@/config/logger";
import { loadEventListeners } from "./events/event.loader";

export async function buildApp() {
  const app = Fastify({
    logger: loggerConfig,
  });
  await setupPlugins(app);
  await registerModules(app);

  await loadEventListeners(app.event);
  setupErrorHandler(app);
  return app;
}
