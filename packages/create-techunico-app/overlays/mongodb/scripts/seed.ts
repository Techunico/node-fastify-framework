import "dotenv/config";
import mongoose from "mongoose";
import { Permission, Role } from "../src/models/rbac.model";

async function main() {
  await mongoose.connect(process.env.MONGO_URI!);

  const permissions = await Permission.insertMany([
    { name: "user.read" },
    { name: "user.create" },
    { name: "user.update" },
    { name: "user.delete" },
  ]);

  await Role.create({
    name: "admin",
    permissions: permissions.map((permission) => permission._id),
  });

  await Role.create({
    name: "user",
  });
}

main()
  .then(async () => {
    await mongoose.disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await mongoose.disconnect();
    process.exit(1);
  });