import fp from "fastify-plugin";
import { FastifyInstance } from "fastify";
import { MongooseAdapter } from "./mongoose.adapter";

async function mongoosePlugin(app: FastifyInstance) {
  // One adapter per process; models use mongoose's default connection only.
  const db = new MongooseAdapter();
  db.setLogger(app.log);

  await db.connect();

  app.decorate("db", db);

  app.addHook("onClose", async () => {
    app.log.info("Closing MongoDB via Fastify onClose…");
    await db.disconnect();
  });
}

export default fp(mongoosePlugin, {
  name: "db-mongoose",
  encapsulate: false,
});
