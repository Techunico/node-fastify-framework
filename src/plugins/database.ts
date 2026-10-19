/**
 * Database binding for this application.
 *
 * This is the only place that names the database plugin. PostgreSQL
 * applications (and the framework repository) use Prisma; generated MongoDB
 * applications receive a version of this file that binds Mongoose instead.
 */
import databasePlugin, { PrismaAdapter } from "./db-prisma/prisma.plugin";

export const databaseProvider = "postgresql" as const;

export type AppDatabase = PrismaAdapter;

export default databasePlugin;
