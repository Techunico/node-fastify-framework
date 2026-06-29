export interface UserListItem {
  id: string;
  name: string;
  email: string;
  createdAt: Date;
}

export interface RoleRecord {
  id: string;
  name: string;
}

export interface AuthUserRecord {
  id: string;
  name: string;
  email: string;
  password: string;
  createdAt: Date;
  role: {
    name: string;
    permissions: Array<{ name: string }>;
  } | null;
}

export interface CreateUserData {
  name: string;
  email: string;
  password: string;
  roleId: string;
}

export interface IUserRepository {
  findAll(): Promise<UserListItem[]>;
  findByEmail(email: string): Promise<{ id: string; email: string } | null>;
  findAuthUserByEmail(email: string): Promise<AuthUserRecord | null>;
  create(data: CreateUserData): Promise<void>;
  findRoleByName(name: string): Promise<RoleRecord | null>;
}