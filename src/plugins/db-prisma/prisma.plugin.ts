import fp from "fastify-plugin";
import { FastifyInstance } from "fastify";
import { PrismaClient } from "@/generated/prisma/client";
import { config } from "@/config";
import pg from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import path from "path";
import { PrismaDatabaseAdapter } from "./prisma.adapter";

async function dbPlugin(app: FastifyInstance) {
  let pool: pg.Pool | undefined;
  let adapterInstance: PrismaPg | PrismaBetterSqlite3;

  switch (config.db.provider) {
    case "postgresql":
      pool = new pg.Pool({ connectionString: config.db.url });
      adapterInstance = new PrismaPg(pool);
      break;

    case "sqlite": {
      const dbPathRaw = config.db.url.replace("file:", "");
      const projectRoot = path.resolve(__dirname, "../..");
      const finalDbPath = path.join(projectRoot, dbPathRaw);

      adapterInstance = new PrismaBetterSqlite3({
        url: `file:${finalDbPath}`,
      });
      break;
    }

    default:
      throw new Error(`Unsupported db provider: ${config.db.provider}`);
  }

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