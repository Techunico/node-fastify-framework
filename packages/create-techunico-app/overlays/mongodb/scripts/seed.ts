import "dotenv/config";
import mongoose from "mongoose";
import { Permission, Role } from "../src/models/rbac.model";

const PERMISSIONS = ["user.read", "user.create", "user.update", "user.delete"];

// Idempotent: safe to run repeatedly.
async function main() {
  const uri = process.env.MONGO_URI;
  if (!uri) {
    throw new Error("MONGO_URI is not set");
  }

  await mongoose.connect(uri);
  await Promise.all([Permission.init(), Role.init()]);

  for (const name of PERMISSIONS) {
    await Permission.updateOne({ name }, { $setOnInsert: { name } }, { upsert: true });
  }

  const permissions = await Permission.find({ name: { $in: PERMISSIONS } }).select("_id");

  await Role.updateOne(
    { name: "admin" },
    { $set: { permissions: permissions.map((permission) => permission._id) } },
    { upsert: true },
  );

  await Role.updateOne({ name: "user" }, { $setOnInsert: { name: "user" } }, { upsert: true });
}

main()
  .then(async () => {
    await mongoose.disconnect();
  })
  .catch(async (error) => {
    console.error(error instanceof Error ? error.message : error);
    await mongoose.disconnect();
    process.exit(1);
  });
