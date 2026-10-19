import { randomBytes } from "crypto";
import { envSchema, isWeakSecret } from "@/config/env.schema";

const strongSecret = () => randomBytes(48).toString("base64url");

const baseEnv = () => ({
  NODE_ENV: "test",
  DB_PROVIDER: "postgresql",
  DATABASE_URL: "postgresql://u:p@localhost:5432/db",
  JWT_SECRET: strongSecret(),
});

describe("environment schema", () => {
  it("accepts a minimal PostgreSQL configuration without Redis settings", () => {
    const parsed = envSchema.parse(baseEnv());
    expect(parsed.DB_PROVIDER).toBe("postgresql");
    expect(parsed.REDIS_PORT).toBe(6379);
  });

  it("requires the URL for the selected database", () => {
    expect(() => envSchema.parse({ ...baseEnv(), DATABASE_URL: "" })).toThrow(/DATABASE_URL/);
    expect(() =>
      envSchema.parse({ ...baseEnv(), DB_PROVIDER: "mongodb", DATABASE_URL: undefined }),
    ).toThrow(/MONGO_URI/);
    expect(
      envSchema.parse({ ...baseEnv(), DB_PROVIDER: "mongodb", MONGO_URI: "mongodb://localhost/db" })
        .DB_PROVIDER,
    ).toBe("mongodb");
  });

  it("rejects unsupported providers such as sqlite", () => {
    expect(() => envSchema.parse({ ...baseEnv(), DB_PROVIDER: "sqlite" })).toThrow();
  });

  it.each([
    ["the historical template default", "SUPERSECURESECRET"],
    ["a short value", "abcdefghij"],
    ["a long placeholder", "SUPERSECURESECRET-SUPERSECURESECRET-1234"],
    ["a low-entropy value", "a".repeat(64)],
    ["the old hardcoded admin key", "secret_admin_secret_admin_secret_admin"],
  ])("rejects JWT_SECRET that is %s", (_label, value) => {
    expect(isWeakSecret(value)).toBe(true);
    expect(() => envSchema.parse({ ...baseEnv(), JWT_SECRET: value })).toThrow(/JWT_SECRET/);
  });

  it("requires JWT_SECRET", () => {
    const env: Record<string, string | undefined> = baseEnv();
    delete env.JWT_SECRET;
    expect(() => envSchema.parse(env)).toThrow(/JWT_SECRET/);
  });

  it("treats an empty JWT_ADMIN_SECRET as unset but validates a provided one", () => {
    expect(envSchema.parse({ ...baseEnv(), JWT_ADMIN_SECRET: "" }).JWT_ADMIN_SECRET).toBeUndefined();
    expect(() => envSchema.parse({ ...baseEnv(), JWT_ADMIN_SECRET: "changeme" })).toThrow(
      /JWT_ADMIN_SECRET/,
    );
  });

  it("accepts generated random secrets", () => {
    expect(isWeakSecret(strongSecret())).toBe(false);
  });
});
