// Entry point: load .env, validate configuration, start the server.
import "dotenv/config";
import { loadConfig } from "./config";
import { buildApp } from "./app";
import { installShutdownHandlers } from "./core/lifecycle";

async function start() {
  const config = loadConfig(process.env);
  const app = await buildApp({ config });

  installShutdownHandlers(app, { timeoutMs: config.shutdown.timeoutMs });

  try {
    await app.listen({ port: config.app.port, host: config.app.host });
  } catch (err) {
    app.log.error({ err }, "Failed to listen");
    await app.close().catch(() => undefined);
    process.exit(1);
  }
}

start().catch((err) => {
  // Configuration and startup errors: message only (never values of variables).
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
