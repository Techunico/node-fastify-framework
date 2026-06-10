import fp from "fastify-plugin";
import { FastifyInstance } from "fastify";
import { MongooseAdapter } from "./mongoose.adapter";

async function mongoosePlugin(app: FastifyInstance) {
  const db = new MongooseAdapter();

  await db.connect();

  app.decorate("db", db);

  app.addHook("onClose", async () => {
    await db.disconnect();
  });
}

export default fp(mongoosePlugin);