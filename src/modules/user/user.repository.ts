import type { AppDatabase } from "@/plugins/database";
import type {
  AuthUserRecord,
  CreateUserInput,
  UserRecord,
  UserRepositoryContract,
} from "./user.types";

const publicFields = { id: true, name: true, email: true, createdAt: true } as const;

/** PostgreSQL (Prisma) implementation of the user repository contract. */
export class UserRepository implements UserRepositoryContract {
  private readonly prisma: ReturnType<AppDatabase["getClient"]>;

  constructor(db: AppDatabase) {
    this.prisma = db.getClient();
  }

  async findAll(): Promise<UserRecord[]> {
    const users = await this.prisma.user.findMany({ select: publicFields });
    return users.map((user) => ({ ...user, id: String(user.id) }));
  }

  async findByEmail(email: string): Promise<UserRecord | null> {
    const user = await this.prisma.user.findUnique({ where: { email }, select: publicFields });
    return user ? { ...user, id: String(user.id) } : null;
  }

  async findAuthUserByEmail(email: string): Promise<AuthUserRecord | null> {
    const user = await this.prisma.user.findUnique({
      where: { email },
      include: { role: { include: { permissions: { select: { name: true } } } } },
    });
    if (!user) return null;

    return {
      id: String(user.id),
      name: user.name,
      email: user.email,
      password: user.password,
      createdAt: user.createdAt,
      role: user.role
        ? { name: user.role.name, permissions: user.role.permissions.map((p) => p.name) }
        : null,
    };
  }

  async create(data: CreateUserInput): Promise<UserRecord> {
    const user = await this.prisma.user.create({
      data: { name: data.name, email: data.email, password: data.password, roleId: Number(data.roleId) },
      select: publicFields,
    });
    return { ...user, id: String(user.id) };
  }

  async findRoleByName(name: string) {
    const role = await this.prisma.role.findUnique({ where: { name } });
    return role ? { id: String(role.id), name: role.name } : null;
  }
}
