// Load .env before anything reads configuration.
import "dotenv/config";
import { config } from "./config";
import { buildApp } from "./app";

async function start() {
  const app = await buildApp();

  try {
    await app.listen({ port: config.app.port, host: config.app.host });
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

start().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
