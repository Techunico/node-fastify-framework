import fp from "fastify-plugin";
import { FastifyInstance } from "fastify";
import { PrismaClient } from "@/generated/prisma/client";
import { config } from "@/config";
import pg from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaDatabaseAdapter } from "./prisma.adapter";

async function dbPlugin(app: FastifyInstance) {
  let pool: pg.Pool | undefined;

  if (config.db.provider !== "postgresql") {
    throw new Error(`Unsupported db provider: ${config.db.provider}`);
  }

  pool = new pg.Pool({ connectionString: config.db.url });
  const adapterInstance = new PrismaPg(pool);

  const prisma = new PrismaClient({ adapter: adapterInstance });
  const db = new PrismaDatabaseAdapter(prisma);

  await db.connect();

  app.decorate("db", db);

  app.addHook("onClose", async () => {
    await db.disconnect();
    if (pool) await pool.end();
  });
}

export const pluginMeta = {
  type: "db",
  name: "postgresql",
};

export default fp(dbPlugin);