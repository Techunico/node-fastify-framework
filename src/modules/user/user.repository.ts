import { PrismaClient } from "@/generated/prisma/client";

export class UserRepository {
  constructor(private prisma: PrismaClient) {}

  async findAll() {
    return this.prisma.user.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        createdAt: true,
      },
    });
  }

  async findByEmail(email: string) {
    return this.prisma.user.findUnique({
      where: { email },
    });
  }

  async findAuthUserByEmail(email: string) {
    return this.prisma.user.findUnique({
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

  async create(data: { name: string; email: string; password: string, roleId:number }) {
    return this.prisma.user.create({ data });
  }

  async findRoleByName(name: string) {
    return this.prisma.role.findUnique({
      where: { name },
    });
  }
}
