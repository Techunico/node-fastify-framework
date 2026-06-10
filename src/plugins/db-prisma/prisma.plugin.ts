import fp from "fastify-plugin";
import { FastifyInstance } from "fastify";
import { PrismaClient } from "@/generated/prisma/client";
import { config } from "@/config";
import pg from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import path from "path";

// ✅ Define a minimal adapter interface (can move to core later)
interface DatabaseAdapter {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  getClient(): unknown;
}

class PrismaAdapter implements DatabaseAdapter {
  private prisma: PrismaClient;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  async connect() {
    await this.prisma.$connect();
  }

  async disconnect() {
    await this.prisma.$disconnect();
  }

  getClient() {
    return this.prisma;
  }
}

async function dbPlugin(app: FastifyInstance) {
  let pool: pg.Pool | undefined;
  let adapterInstance: PrismaPg | PrismaBetterSqlite3;

  // 🔧 Choose adapter
  switch (config.db.provider) {
    case "postgresql":
      pool = new pg.Pool({ connectionString: config.db.url });
      adapterInstance = new PrismaPg(pool);
      break;

    case "sqlite":
      const dbPathRaw = config.db.url.replace("file:", "");
      const projectRoot = path.resolve(__dirname, "../..");
      const finalDbPath = path.join(projectRoot, dbPathRaw);

      adapterInstance = new PrismaBetterSqlite3({
        url: `file:${finalDbPath}`,
      });
      break;

    default:
      throw new Error(`Unsupported db provider: ${config.db.provider}`);
  }

  // ✅ Create Prisma
  const prisma = new PrismaClient({ adapter: adapterInstance });

  // ✅ Wrap inside adapter
  const db = new PrismaAdapter(prisma);

  await db.connect();

  // ✅ Expose GENERIC interface
  app.decorate("db", db);

  // ❌ REMOVE THIS (important)
  // app.decorate("prisma", prisma);

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