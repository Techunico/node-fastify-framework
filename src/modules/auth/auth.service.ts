import bcrypt from "bcrypt";
import { AppError } from "@/utils/app-error";
import type { AuthUserRecord, UserRepositoryContract } from "@/modules/user/user.types";

export interface AuthenticatedUser {
  id: string;
  name: string;
  email: string;
  role: string | null;
  permissions: string[];
  createdAt: Date;
}

/** A valid bcrypt hash compared against when the user does not exist (equalises timing). */
const DUMMY_HASH = "$2b$10$CwTycUXWue0Thq9StjUM0uJ8.ExYhG0Dj7eBnmRWyFvdm5KfaO2vS";

export class AuthService {
  constructor(private readonly repo: UserRepositoryContract) {}

  async register(data: { name: string; email: string; password: string }) {
    const existing = await this.repo.findByEmail(data.email);

    if (existing) {
      throw new AppError("Email already exists", 400, "EMAIL_EXISTS");
    }

    const userRole = await this.repo.findRoleByName("user");

    if (!userRole) {
      throw new AppError("Default user role is missing", 500, "INTERNAL_SERVER_ERROR");
    }

    const hashed = await bcrypt.hash(data.password, 10);

    await this.repo.create({
      name: data.name,
      email: data.email,
      password: hashed,
      roleId: userRole.id,
    });

    const user = await this.repo.findAuthUserByEmail(data.email);

    if (!user) {
      throw new AppError("User not found after registration", 500, "INTERNAL_SERVER_ERROR");
    }

    return this.toAuthenticatedUser(user);
  }

  async login(email: string, password: string) {
    const user = await this.repo.findAuthUserByEmail(email);
    const valid = await bcrypt.compare(password, user?.password ?? DUMMY_HASH);

    if (!user || !valid) {
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
      permissions: user.role?.permissions ?? [],
      createdAt: user.createdAt,
    };
  }
}
