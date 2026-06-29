import {
  AuthUserRecord,
  CreateUserData,
  IUserRepository,
  RoleRecord,
  UserListItem,
} from "@/core/interfaces/repositories/user.repository";
import { Role, User } from "../models/rbac.model";

export class MongooseUserRepository implements IUserRepository {
  async findAll(): Promise<UserListItem[]> {
    const users = await User.find().select("name email createdAt").lean();

    return users.map((user) => ({
      id: String(user._id),
      name: user.name,
      email: user.email,
      createdAt: user.createdAt,
    }));
  }

  async findByEmail(email: string) {
    const user = await User.findOne({ email }).select("_id email").lean();

    if (!user) {
      return null;
    }

    return { id: String(user._id), email: user.email };
  }

  async findAuthUserByEmail(email: string): Promise<AuthUserRecord | null> {
    const user = await User.findOne({ email })
      .populate({
        path: "role",
        populate: { path: "permissions", select: "name" },
      })
      .lean();

    if (!user) {
      return null;
    }

    const role = user.role as
      | {
          name: string;
          permissions?: Array<{ name: string }>;
        }
      | undefined;

    return {
      id: String(user._id),
      name: user.name,
      email: user.email,
      password: user.password,
      createdAt: user.createdAt,
      role: role
        ? {
            name: role.name,
            permissions:
              role.permissions?.map((permission) => ({
                name: permission.name,
              })) ?? [],
          }
        : null,
    };
  }

  async create(data: CreateUserData): Promise<void> {
    await User.create({
      name: data.name,
      email: data.email,
      password: data.password,
      role: data.roleId,
    });
  }

  async findRoleByName(name: string): Promise<RoleRecord | null> {
    const role = await Role.findOne({ name }).select("_id name").lean();

    if (!role) {
      return null;
    }

    return { id: String(role._id), name: role.name };
  }
}