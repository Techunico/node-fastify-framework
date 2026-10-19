// Entry point: load .env, validate configuration, start the server.
import "dotenv/config";
import { loadConfig } from "./config";
import { buildApp } from "./app";

async function start() {
  const config = loadConfig(process.env);
  const app = await buildApp({ config });

  await app.listen({ port: config.app.port, host: config.app.host });
}

start().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
