import fp from "fastify-plugin";
import { FastifyInstance } from "fastify";
import { PrismaClient } from "@/generated/prisma/client";
import { config } from "@/config";
import pg from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import path from "path";
import fs from "fs";

async function dbPlugin(app: FastifyInstance) {
  let pool: pg.Pool | undefined;

  let adapter: PrismaPg | PrismaBetterSqlite3;

  console.log("config.db.url", config.db.url);

  switch (config.db.provider) {
    case "postgresql":
      pool = new pg.Pool({ connectionString: config.db.url });
      adapter = new PrismaPg(pool);
      break;
    case "sqlite":
      const dbPathRaw = config.db.url.replace("file:", "");
      const projectRoot = path.resolve(__dirname, "../..");
      const finalDbPath = path.join(projectRoot, dbPathRaw);
      adapter = new PrismaBetterSqlite3({
        url: `file:${finalDbPath}`,
      });
      break;
    default:
      throw new Error(`Unsupported db provider: ${config.db.provider}`);
  }

  const prisma = new PrismaClient({ adapter });

  app.decorate("prisma", prisma);

  app.addHook("onClose", async () => {
    await prisma.$disconnect();
    if (pool) await pool.end();
  });
}

export default fp(dbPlugin);
