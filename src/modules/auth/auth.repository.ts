import { PrismaClient } from "@/generated/prisma/client";
import { BaseRepository } from "@/core/base.repository";

export class UserRepository extends BaseRepository<any> {
  private prisma: PrismaClient;

  constructor(prisma: PrismaClient) {
    super(prisma.user);
    this.prisma = prisma;
  }

  async findByEmail(email: string) {
    return this.model.findUnique({
      where: { email },
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
}
