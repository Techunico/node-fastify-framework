import { Schema } from "mongoose";
import { registerModel } from "@/plugins/db-mongoose/register-model";

const permissionSchema = new Schema({
  name: { type: String, unique: true, required: true },
});

const roleSchema = new Schema({
  name: { type: String, unique: true, required: true },
  permissions: [{ type: Schema.Types.ObjectId, ref: "Permission" }],
});

const userSchema = new Schema({
  name: { type: String, required: true },
  email: { type: String, unique: true, required: true },
  password: { type: String, required: true },
  role: { type: Schema.Types.ObjectId, ref: "Role" },
  createdAt: { type: Date, default: Date.now },
});

export const Permission = registerModel("Permission", permissionSchema);
export const Role = registerModel("Role", roleSchema);
export const User = registerModel("User", userSchema);
