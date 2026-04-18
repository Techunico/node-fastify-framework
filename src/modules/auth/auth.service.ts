import bcrypt from "bcrypt";
import { UserRepository } from "@/modules/user/user.repository";
import { PrismaClient } from "@/generated/prisma/client";
import { AppError } from "@/utils/app-error";
import { RequestContext } from "@/types/request-context";

export class AuthService {
  private repo: UserRepository;

  constructor(
    prisma: PrismaClient,
    private ctx?: RequestContext,
  ) {
    this.repo = new UserRepository(prisma);
  }

  async register(data: { name: string; email: string; password: string }) {
    const existing = await this.repo.findByEmail(data.email);

    if (existing) {
      throw new AppError("Email already exists", 400, "EMAIL_EXISTS");
    }

    const hashed = await bcrypt.hash(data.password, 10);
    const userRole = await this.repo.fetchUserRoles("user");

    const user = await this.repo.create({
      ...data,
      password: hashed,
      roleId: userRole?.id ?? 0,
    });

    return user;
  }

  async login(email: string, password: string) {
    const userId = this.ctx?.user?.id;
    const user = await this.repo.findByEmail(email);

    if (!user) {
      throw new AppError("Invalid credentials", 401, "INVALID_CREDENTIALS");
    }

    const valid = await bcrypt.compare(password, user.password);

    if (!valid) {
      throw new AppError("Invalid credentials", 401, "INVALID_CREDENTIALS");
    }

    return user;
  }
}
