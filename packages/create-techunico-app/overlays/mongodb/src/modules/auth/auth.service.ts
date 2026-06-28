import bcrypt from "bcrypt";
import { UserRepository } from "@/modules/user/user.repository";
import { AppError } from "@/utils/app-error";
import { RequestContext } from "@/types/request-context";

export interface AuthenticatedUser {
  id: string;
  name: string;
  email: string;
  role: string | null;
  permissions: string[];
  createdAt: Date;
}

export class AuthService {
  private repo = new UserRepository();

  constructor(private ctx?: RequestContext) {}

  async register(data: { name: string; email: string; password: string }) {
    const existing = await this.repo.findByEmail(data.email);

    if (existing) {
      throw new AppError("Email already exists", 400, "EMAIL_EXISTS");
    }

    const hashed = await bcrypt.hash(data.password, 10);
    const userRole = await this.repo.findRoleByName("user");

    if (!userRole) {
      throw new AppError("Default user role is missing", 500, "INTERNAL_SERVER_ERROR");
    }

    await this.repo.create({
      ...data,
      password: hashed,
      roleId: String(userRole._id),
    });

    const user = await this.repo.findAuthUserByEmail(data.email);

    if (!user) {
      throw new AppError("User not found after registration", 500, "INTERNAL_SERVER_ERROR");
    }

    return this.toAuthenticatedUser(user);
  }

  async login(email: string, password: string) {
    void this.ctx;

    const user = await this.repo.findAuthUserByEmail(email);

    if (!user) {
      throw new AppError("Invalid credentials", 401, "INVALID_CREDENTIALS");
    }

    const valid = await bcrypt.compare(password, user.password);

    if (!valid) {
      throw new AppError("Invalid credentials", 401, "INVALID_CREDENTIALS");
    }

    return this.toAuthenticatedUser(user);
  }

  private toAuthenticatedUser(user: any): AuthenticatedUser {
    return {
      id: String(user._id),
      name: user.name,
      email: user.email,
      role: user.role?.name ?? null,
      permissions: user.role?.permissions?.map((permission: { name: string }) => permission.name) ?? [],
      createdAt: user.createdAt,
    };
  }
}