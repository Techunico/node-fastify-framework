import type { UserRepositoryContract } from './user.types'

export class UserService {
  constructor(private readonly repo: UserRepositoryContract) {}

  async getAllUsers() {
    return this.repo.findAll()
  }
}
