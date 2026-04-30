import "dotenv/config";
import path from "path";
import { defineConfig } from "prisma/config";

const provider = process.env.DB_PROVIDER ?? "postgresql";

const schemaMap: Record<string, string> = {
  postgresql: "prisma/schema.postgresql.prisma",
  sqlite:     "prisma/schema.sqlite.prisma",
};

if (!schemaMap[provider]) {
  throw new Error(`Unsupported DB_PROVIDER: "${provider}"`);
}

export default defineConfig({
  schema: schemaMap[provider],
  migrations: {
    path: `prisma/migrations_${provider}`,   // 👈 separate history per provider
  },
  datasource: {
    url: process.env.DATABASE_URL,
  },
});