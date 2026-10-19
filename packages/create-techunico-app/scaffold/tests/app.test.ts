import { randomBytes } from "crypto";
import { buildApp } from "@/app";
import { loadConfig } from "@/config";
import { databaseProvider } from "@/plugins/database";

/**
 * Example: boot the application with Fastify's inject() and a stub database
 * adapter, so tests need no running database.
 */
const stubDatabase = {
  provider: databaseProvider,
  connect: async () => undefined,
  disconnect: async () => undefined,
  ping: async () => undefined,
  getClient: () => ({}),
};

const secret = () => randomBytes(48).toString("base64url");

function testConfig() {
  return loadConfig({
    NODE_ENV: "test",
    DB_PROVIDER: databaseProvider,
    DATABASE_URL: "postgresql://unused@127.0.0.1:1/unused",
    MONGO_URI: "mongodb://127.0.0.1:1/unused",
    JWT_SECRET: secret(),
    PLUGINS: "",
  });
}

describe("application", () => {
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeAll(async () => {
    app = await buildApp({ config: testConfig(), database: stubDatabase as never, logger: false });
  });

  afterAll(async () => {
    await app.close();
  });

  it("GET /health → 200", async () => {
    const res = await app.inject({ method: "GET", url: "/health" });
    expect(res.statusCode).toBe(200);
  });

  it("GET /ready → 200 when the database answers", async () => {
    const res = await app.inject({ method: "GET", url: "/ready" });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.checks.database.status).toBe("ok");
  });

  it("protected routes require a token", async () => {
    const res = await app.inject({ method: "GET", url: "/api/v1/auth/me" });
    expect(res.statusCode).toBe(401);
  });
});
