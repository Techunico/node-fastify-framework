import fp from "fastify-plugin";
import { FastifyInstance } from "fastify";
import { MongooseAdapter } from "./mongoose.adapter";
import { registerModels, RegisterModelsOptions } from "./model-loader";

export interface MongoosePluginOptions {
  uri?: string;
  /** Extra model directories, forwarded to the model loader. */
  modelDirs?: RegisterModelsOptions["extraDirs"];
}

async function mongoosePlugin(app: FastifyInstance, options: MongoosePluginOptions) {
  // One adapter per process; models use mongoose's default connection only.
  const db = new MongooseAdapter(options.uri ?? app.config.db.url);
  db.setLogger(app.log);

  await db.connect();

  // Models are loaded after the connection is open and before any module or
  // service is registered, so repositories always see compiled models.
  await registerModels({ logger: app.log, extraDirs: options.modelDirs });

  // `app.db` is typed by src/plugins/database.ts. In MongoDB applications that
  // type is MongooseAdapter; the framework repository binds PostgreSQL, so the
  // decoration is widened here to compile in both.
  app.decorate("db", db as unknown as FastifyInstance["db"]);

  app.addHook("onClose", async () => {
    app.log.info("Closing MongoDB via Fastify onClose…");
    await db.disconnect();
  });
}

export default fp(mongoosePlugin, {
  name: "db-mongoose",
});
