import { UserRepository } from './user.repository'
import { PrismaClient } from '../../generated/prisma'

export class UserService {
  private repo: UserRepository

  constructor(prisma: PrismaClient) {
    this.repo = new UserRepository(prisma)
  }

  async getAllUsers() {
    return this.repo.findAll()
  }

  async createUser(data: { name: string; email: string; password:string; roleId:number }) {
    return this.repo.create(data)
  }
}