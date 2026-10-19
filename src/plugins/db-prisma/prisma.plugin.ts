import fp from "fastify-plugin";
import { FastifyInstance } from "fastify";
import { PrismaClient } from "@/generated/prisma/client";
import pg from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import type { DatabaseAdapter } from "@/core/interfaces/database";

declare module "fastify" {
  interface FastifyInstance {
    /** Generated Prisma client (PostgreSQL applications only). Same client as `app.db.getClient()`. */
    prisma: PrismaClient;
  }
}

export class PrismaAdapter implements DatabaseAdapter<PrismaClient> {
  readonly provider = "postgresql" as const;

  constructor(private readonly prisma: PrismaClient) {}

  async connect() {
    await this.prisma.$connect();
  }

  async disconnect() {
    await this.prisma.$disconnect();
  }

  async ping() {
    await this.prisma.$queryRaw`SELECT 1`;
  }

  getClient() {
    return this.prisma;
  }
}

export interface PrismaPluginOptions {
  url?: string;
}

async function prismaPlugin(app: FastifyInstance, options: PrismaPluginOptions) {
  const pool = new pg.Pool({ connectionString: options.url ?? app.config.db.url });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
  const db = new PrismaAdapter(prisma);

  try {
    await db.connect();
  } catch (error) {
    await pool.end().catch(() => undefined);
    throw error;
  }

  app.decorate("db", db);
  app.decorate("prisma", prisma);

  app.addHook("onClose", async () => {
    await db.disconnect();
    await pool.end();
  });
}

export const pluginMeta = {
  type: "db",
  name: "postgresql",
};

export default fp(prismaPlugin, { name: "db-prisma" });
