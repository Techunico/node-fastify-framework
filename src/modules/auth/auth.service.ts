import bcrypt from "bcrypt";
import { DatabaseAdapter } from "@/core/interfaces/database";
import { AppError } from "@/utils/app-error";
import { RequestContext } from "@/types/request-context";
import { AuthUserRecord } from "@/core/interfaces/repositories/user.repository";

export interface AuthenticatedUser {
  id: string;
  name: string;
  email: string;
  role: string | null;
  permissions: string[];
  createdAt: Date;
}

export class AuthService {
  constructor(
    private readonly db: DatabaseAdapter,
    private ctx?: RequestContext,
  ) {}

  async register(data: { name: string; email: string; password: string }) {
    const userRepo = this.db.repositories.user;
    const existing = await userRepo.findByEmail(data.email);

    if (existing) {
      throw new AppError("Email already exists", 400, "EMAIL_EXISTS");
    }

    const hashed = await bcrypt.hash(data.password, 10);
    const userRole = await userRepo.findRoleByName("user");

    if (!userRole) {
      throw new AppError("Default user role is missing", 500, "INTERNAL_SERVER_ERROR");
    }

    await userRepo.create({
      ...data,
      password: hashed,
      roleId: userRole.id,
    });

    const user = await userRepo.findAuthUserByEmail(data.email);

    if (!user) {
      throw new AppError("User not found after registration", 500, "INTERNAL_SERVER_ERROR");
    }

    return this.toAuthenticatedUser(user);
  }

  async login(email: string, password: string) {
    void this.ctx;

    const user = await this.db.repositories.user.findAuthUserByEmail(email);

    if (!user) {
      throw new AppError("Invalid credentials", 401, "INVALID_CREDENTIALS");
    }

    const valid = await bcrypt.compare(password, user.password);

    if (!valid) {
      throw new AppError("Invalid credentials", 401, "INVALID_CREDENTIALS");
    }

    return this.toAuthenticatedUser(user);
  }

  private toAuthenticatedUser(user: AuthUserRecord): AuthenticatedUser {
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role?.name ?? null,
      permissions: user.role?.permissions.map((permission) => permission.name) ?? [],
      createdAt: user.createdAt,
    };
  }
}