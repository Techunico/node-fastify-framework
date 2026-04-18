import { PrismaClient } from "@/generated/prisma/client";

export class UserRepository {
  constructor(private prisma: PrismaClient) {}

  async findByEmail(email: string) {
    return this.prisma.user.findUnique({
      where: { email },
    });
  }

  async create(data: {
    name: string;
    email: string;
    password: string;
    roleId: number;
  }) {
    return this.prisma.user.create({ data });
  }
}
