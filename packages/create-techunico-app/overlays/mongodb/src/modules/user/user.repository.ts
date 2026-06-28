import { Role, User } from "@/models/rbac.model";

export class UserRepository {
  async findAll() {
    return User.find().select("name email createdAt").lean();
  }

  async findByEmail(email: string) {
    return User.findOne({ email }).lean();
  }

  async findAuthUserByEmail(email: string) {
    return User.findOne({ email })
      .populate({
        path: "role",
        populate: { path: "permissions", select: "name" },
      })
      .lean();
  }

  async create(data: {
    name: string;
    email: string;
    password: string;
    roleId: string;
  }) {
    return User.create({
      name: data.name,
      email: data.email,
      password: data.password,
      role: data.roleId,
    });
  }

  async findRoleByName(name: string) {
    return Role.findOne({ name }).lean();
  }
}