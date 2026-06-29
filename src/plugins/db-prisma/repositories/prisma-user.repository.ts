import { PrismaClient } from "@/generated/prisma/client";
import {
  AuthUserRecord,
  CreateUserData,
  IUserRepository,
  RoleRecord,
  UserListItem,
} from "@/core/interfaces/repositories/user.repository";

export class PrismaUserRepository implements IUserRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findAll(): Promise<UserListItem[]> {
    const users = await this.prisma.user.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        createdAt: true,
      },
    });

    return users.map((user) => ({
      id: String(user.id),
      name: user.name,
      email: user.email,
      createdAt: user.createdAt,
    }));
  }

  async findByEmail(email: string) {
    const user = await this.prisma.user.findUnique({
      where: { email },
      select: { id: true, email: true },
    });

    if (!user) {
      return null;
    }

    return { id: String(user.id), email: user.email };
  }

  async findAuthUserByEmail(email: string): Promise<AuthUserRecord | null> {
    const user = await this.prisma.user.findUnique({
      where: { email },
      include: {
        role: {
          include: {
            permissions: {
              select: { name: true },
            },
          },
        },
      },
    });

    if (!user) {
      return null;
    }

    return {
      id: String(user.id),
      name: user.name,
      email: user.email,
      password: user.password,
      createdAt: user.createdAt,
      role: user.role
        ? {
            name: user.role.name,
            permissions: user.role.permissions.map((permission) => ({
              name: permission.name,
            })),
          }
        : null,
    };
  }

  async create(data: CreateUserData): Promise<void> {
    await this.prisma.user.create({
      data: {
        name: data.name,
        email: data.email,
        password: data.password,
        roleId: Number(data.roleId),
      },
    });
  }

  async findRoleByName(name: string): Promise<RoleRecord | null> {
    const role = await this.prisma.role.findUnique({
      where: { name },
      select: { id: true, name: true },
    });

    if (!role) {
      return null;
    }

    return { id: String(role.id), name: role.name };
  }
}