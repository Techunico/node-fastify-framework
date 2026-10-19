import "dotenv/config";
import { defineConfig } from "prisma/config";

// Framework development database (PostgreSQL only). Generated applications
// get their own prisma.config.ts from packages/create-techunico-app/assets.
export default defineConfig({
  schema: "prisma/schema.postgresql.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "ts-node prisma/seed.ts",
  },
  datasource: {
    url: process.env.DATABASE_URL,
  },
});
