import { PrismaClient } from "@/generated/prisma/client";
import { BaseRepository } from "@/core/base.repository";

export class UserRepository extends BaseRepository<any> {
  private prisma: PrismaClient;

  constructor(prisma: PrismaClient) {
    super(prisma.user);
    this.prisma = prisma;
  }

  // ✅ Override base method (custom select)
  async findAll() {
    return this.model.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        createdAt: true,
      },
    });
  }

  async findByEmail(email: string) {
    return this.model.findUnique({
      where: { email },
    });
  }

  async findAuthUserByEmail(email: string) {
    return this.model.findUnique({
      where: { email },
      include: {
        role: {
          include: {
            permissions: {
              select: {
                name: true,
              },
            },
          },
        },
      },
    });
  }

  async create(data: {
    name: string;
    email: string;
    password: string;
    roleId: number;
  }) {
    return this.model.create({ data });
  }

  // ⚠️ Cross-model access → use prisma directly
  async findRoleByName(name: string) {
    return this.prisma.role.findUnique({
      where: { name },
    });
  }
}