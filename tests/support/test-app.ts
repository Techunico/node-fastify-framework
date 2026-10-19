import { randomBytes } from "crypto";
import { Writable } from "stream";
import { buildApp, BuildAppOptions } from "@/app";
import { loadConfig } from "@/config";
import { loggerRedaction } from "@/core/log-redaction";
import type { DatabaseAdapter } from "@/core/interfaces/database";
import { AuthService } from "@/modules/auth/auth.service";
import { UserService } from "@/modules/user/user.service";
import type {
  AuthUserRecord,
  CreateUserInput,
  UserRecord,
  UserRepositoryContract,
} from "@/modules/user/user.types";

export const testSecret = () => randomBytes(48).toString("base64url");

export function testEnv(overrides: Record<string, string> = {}): Record<string, string> {
  return {
    NODE_ENV: "test",
    LOG_LEVEL: "debug",
    DB_PROVIDER: "postgresql",
    DATABASE_URL: "postgresql://unused:unused@127.0.0.1:1/unused",
    JWT_SECRET: testSecret(),
    JWT_ADMIN_SECRET: testSecret(),
    PLUGINS: "",
    ...overrides,
  };
}

/** Database adapter that never touches the network. */
export class StubDatabase implements DatabaseAdapter<Record<string, never>> {
  readonly provider = "postgresql" as const;
  healthy = true;
  connect = async () => undefined;
  disconnect = async () => undefined;
  ping = async () => {
    if (!this.healthy) throw new Error("connect ECONNREFUSED postgres://user:secret-password@db");
  };
  getClient = () => ({}) as Record<string, never>;
}

export class MemoryUserRepository implements UserRepositoryContract {
  private users: AuthUserRecord[] = [];
  private roles = new Map([
    ["1", { id: "1", name: "admin", permissions: ["user.read", "user.create"] }],
    ["2", { id: "2", name: "user", permissions: [] as string[] }],
  ]);
  private roleOf = new Map<string, string>();

  async findAll(): Promise<UserRecord[]> {
    return this.users.map(({ id, name, email, createdAt }) => ({ id, name, email, createdAt }));
  }
  async findByEmail(email: string) {
    return (await this.findAll()).find((u) => u.email === email) ?? null;
  }
  async findAuthUserByEmail(email: string) {
    return this.users.find((u) => u.email === email) ?? null;
  }
  async create(data: CreateUserInput): Promise<UserRecord> {
    const role = this.roles.get(data.roleId) ?? null;
    const record: AuthUserRecord = {
      id: String(this.users.length + 1),
      name: data.name,
      email: data.email,
      password: data.password,
      createdAt: new Date(),
      role: role ? { name: role.name, permissions: role.permissions } : null,
    };
    this.users.push(record);
    this.roleOf.set(record.id, data.roleId);
    return { id: record.id, name: record.name, email: record.email, createdAt: record.createdAt };
  }
  async findRoleByName(name: string) {
    for (const role of this.roles.values()) if (role.name === name) return { id: role.id, name: role.name };
    return null;
  }
}

export function captureLogs() {
  const lines: string[] = [];
  const stream = new Writable({
    write(chunk, _encoding, callback) {
      lines.push(chunk.toString());
      callback();
    },
  });
  return { lines, stream, text: () => lines.join("") };
}

export interface TestAppOptions extends Partial<Omit<BuildAppOptions, "config">> {
  env?: Record<string, string>;
}

export async function buildTestApp(options: TestAppOptions = {}) {
  const env = testEnv(options.env);
  const logs = captureLogs();
  const database = options.database ?? new StubDatabase();
  const repo = new MemoryUserRepository();

  const app = await buildApp({
    config: loadConfig(env),
    logger: { level: env.LOG_LEVEL, stream: logs.stream, redact: loggerRedaction },
    database,
    services: options.services ?? { auth: new AuthService(repo), users: new UserService(repo) },
  });

  return { app, logs, env, database, repo };
}
