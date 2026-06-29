import { DatabaseAdapter } from "@/core/interfaces/database";

export class UserService {
  constructor(private readonly db: DatabaseAdapter) {}

  async getAllUsers() {
    return this.db.repositories.user.findAll();
  }

  async createUser(data: {
    name: string;
    email: string;
    password: string;
    roleId: string;
  }) {
    return this.db.repositories.user.create(data);
  }
}