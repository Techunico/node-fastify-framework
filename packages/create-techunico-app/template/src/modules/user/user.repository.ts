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

  async create(data: { name: string; email: string; password: string, roleId:number }) {
    return this.prisma.user.create({ data });
  }

  async fetchUserRoles(name: string) {
    const userRole = await this.prisma.role.findUnique({
      where: { name: "user" },
    });
    return userRole;
  }
}
