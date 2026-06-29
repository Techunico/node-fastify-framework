import fp from "fastify-plugin";
import { FastifyInstance } from "fastify";
import { config } from "@/config";
import { MongooseDatabaseAdapter } from "./mongoose.adapter";

async function mongoosePlugin(app: FastifyInstance) {
  const db = new MongooseDatabaseAdapter(config.db.url);

  await db.connect();

  app.decorate("db", db);

  app.addHook("onClose", async () => {
    await db.disconnect();
  });
}

export default fp(mongoosePlugin);