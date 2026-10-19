/**
 * Database-agnostic user persistence contract. `user.repository.ts` is the
 * only database-specific file of this module: PostgreSQL (Prisma) in the
 * framework source, MongoDB (Mongoose) in generated MongoDB applications.
 */
export interface UserRecord {
  id: string;
  name: string;
  email: string;
  createdAt: Date;
}

export interface AuthUserRecord extends UserRecord {
  /** bcrypt hash */
  password: string;
  role: { name: string; permissions: string[] } | null;
}

export interface CreateUserInput {
  name: string;
  email: string;
  /** bcrypt hash */
  password: string;
  roleId: string;
}

export interface UserRepositoryContract {
  findAll(): Promise<UserRecord[]>;
  findByEmail(email: string): Promise<UserRecord | null>;
  findAuthUserByEmail(email: string): Promise<AuthUserRecord | null>;
  create(data: CreateUserInput): Promise<UserRecord>;
  findRoleByName(name: string): Promise<{ id: string; name: string } | null>;
}
