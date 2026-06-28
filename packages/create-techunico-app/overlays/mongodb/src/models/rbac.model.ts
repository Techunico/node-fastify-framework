import mongoose from "mongoose";

const permissionSchema = new mongoose.Schema({
  name: { type: String, unique: true, required: true },
});

const roleSchema = new mongoose.Schema({
  name: { type: String, unique: true, required: true },
  permissions: [{ type: mongoose.Schema.Types.ObjectId, ref: "Permission" }],
});

const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, unique: true, required: true },
  password: { type: String, required: true },
  role: { type: mongoose.Schema.Types.ObjectId, ref: "Role" },
  createdAt: { type: Date, default: Date.now },
});

export const Permission = mongoose.model("Permission", permissionSchema);
export const Role = mongoose.model("Role", roleSchema);
export const User = mongoose.model("User", userSchema);