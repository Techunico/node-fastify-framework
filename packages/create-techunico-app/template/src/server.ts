import { config } from "./config/app";
import { buildApp } from "./app";
import 'dotenv/config'

async function start() {
  const app = await buildApp();

  try {
    await app.listen({ port: config.port, host: "0.0.0.0" });
    app.logger.info(`🚀 Server running on http://localhost:${config.port}`);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

start();
