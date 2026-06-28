import { UserRepository } from "./user.repository";

export class UserService {
  private repo = new UserRepository();

  async getAllUsers() {
    return this.repo.findAll();
  }

  async createUser(data: {
    name: string;
    email: string;
    password: string;
    roleId: string;
  }) {
    return this.repo.create(data);
  }
}