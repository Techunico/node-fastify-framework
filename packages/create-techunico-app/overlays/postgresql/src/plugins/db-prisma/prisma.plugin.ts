import fp from "fastify-plugin";
import { FastifyInstance } from "fastify";
import { PrismaClient } from "@/generated/prisma/client";
import { config } from "@/config";
import pg from "pg";
import { PrismaPg } from "@prisma/adapter-pg";

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
  let adapterInstance: PrismaPg;

  if (config.db.provider !== "postgresql") {
    throw new Error(`Unsupported db provider: ${config.db.provider}`);
  }

  pool = new pg.Pool({ connectionString: config.db.url });
  adapterInstance = new PrismaPg(pool);

  const prisma = new PrismaClient({ adapter: adapterInstance });
  const db = new PrismaAdapter(prisma);

  await db.connect();

  app.decorate("db", db);
  app.decorate("prisma", prisma);

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