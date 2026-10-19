import { Types } from "mongoose";
import { Role, User } from "@/models/rbac.model";
import type { AppDatabase } from "@/plugins/database";
import type {
  AuthUserRecord,
  CreateUserInput,
  UserRecord,
  UserRepositoryContract,
} from "./user.types";

type UserDocument = { _id: Types.ObjectId; name: string; email: string; createdAt: Date };

const toRecord = (user: UserDocument): UserRecord => ({
  id: String(user._id),
  name: user.name,
  email: user.email,
  createdAt: user.createdAt,
});

/** MongoDB (Mongoose) implementation of the user repository contract. */
export class UserRepository implements UserRepositoryContract {
  // Models use the default mongoose connection opened by the database plugin.
  constructor(_db: AppDatabase) {}

  async findAll(): Promise<UserRecord[]> {
    const users = await User.find().select("name email createdAt").lean<UserDocument[]>();
    return users.map(toRecord);
  }

  async findByEmail(email: string): Promise<UserRecord | null> {
    const user = await User.findOne({ email }).select("name email createdAt").lean<UserDocument>();
    return user ? toRecord(user) : null;
  }

  async findAuthUserByEmail(email: string): Promise<AuthUserRecord | null> {
    const user = await User.findOne({ email })
      .populate({ path: "role", populate: { path: "permissions", select: "name" } })
      .lean<UserDocument & { password: string; role?: { name: string; permissions?: { name: string }[] } | null }>();
    if (!user) return null;

    return {
      ...toRecord(user),
      password: user.password,
      role: user.role
        ? { name: user.role.name, permissions: (user.role.permissions ?? []).map((p) => p.name) }
        : null,
    };
  }

  async create(data: CreateUserInput): Promise<UserRecord> {
    const user = await User.create({
      name: data.name,
      email: data.email,
      password: data.password,
      role: data.roleId,
    });
    return toRecord(user);
  }

  async findRoleByName(name: string) {
    const role = await Role.findOne({ name }).lean<{ _id: Types.ObjectId; name: string }>();
    return role ? { id: String(role._id), name: role.name } : null;
  }
}
