/**
 * Database binding for this application (MongoDB / Mongoose).
 *
 * This is the only place that names the database plugin.
 */
import databasePlugin from "./db-mongoose/mongoose.plugin";
import type { MongooseAdapter } from "./db-mongoose/mongoose.adapter";

export const databaseProvider = "mongodb" as const;

export type AppDatabase = MongooseAdapter;

export default databasePlugin;
