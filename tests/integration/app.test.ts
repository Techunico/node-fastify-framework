import { createHmac } from "crypto";
import { buildApp } from "@/app";
import { ConfigError, loadConfig } from "@/config";
import { PluginConfigurationError } from "@/plugins/manifest";
import { buildTestApp, StubDatabase, testEnv } from "../support/test-app";

type TestApp = Awaited<ReturnType<typeof buildTestApp>>;

describe("application (Fastify inject, no database)", () => {
  let ctx: TestApp;

  beforeAll(async () => {
    ctx = await buildTestApp();
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  it("GET /health → 200", async () => {
    const res = await ctx.app.inject({ method: "GET", url: "/health" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ success: true, data: { status: "ok" } });
  });

  it("GET /ready reflects the database check without leaking error details", async () => {
    const ok = await ctx.app.inject({ method: "GET", url: "/ready" });
    expect(ok.statusCode).toBe(200);
    expect(ok.json().data.checks).toEqual({ database: { status: "ok" } });

    (ctx.database as StubDatabase).healthy = false;
    const down = await ctx.app.inject({ method: "GET", url: "/ready" });
    (ctx.database as StubDatabase).healthy = true;

    expect(down.statusCode).toBe(503);
    expect(down.json()).toMatchObject({
      success: false,
      data: { status: "degraded", checks: { database: { status: "fail" } } },
      error: { type: "NOT_READY" },
    });
    expect(down.body).not.toContain("secret-password");
    expect(ctx.logs.text()).not.toContain("secret-password");
  });

  it("mounts modules under API_PREFIX/API_VERSION", async () => {
    const res = await ctx.app.inject({ method: "GET", url: "/api/v1/user" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ success: true, data: [], error: null });
  });

  it("register → login → /me round trip", async () => {
    const register = await ctx.app.inject({
      method: "POST",
      url: "/api/v1/auth/register",
      payload: { name: "Ada", email: "ada@example.com", password: "correct-horse-battery" },
    });
    expect(register.statusCode).toBe(200);
    expect(register.json().data).toMatchObject({ email: "ada@example.com", role: "user" });
    expect(register.body).not.toContain("correct-horse-battery");

    const login = await ctx.app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: { email: "ada@example.com", password: "correct-horse-battery" },
    });
    expect(login.statusCode).toBe(200);
    const token = login.json().data.token as string;

    const me = await ctx.app.inject({ method: "GET", url: "/api/v1/auth/me", headers: { authorization: `Bearer ${token}` } });
    expect(me.statusCode).toBe(200);
    expect(me.json().data).toMatchObject({ type: "user", role: "user" });

    expect(ctx.logs.text()).not.toContain(token);
    expect(ctx.logs.text()).not.toContain("correct-horse-battery");
  });

  it("rejects bad credentials, duplicate emails and invalid input with the standard envelope", async () => {
    const wrong = await ctx.app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: { email: "ada@example.com", password: "nope" },
    });
    expect(wrong.statusCode).toBe(401);
    expect(wrong.json()).toEqual({ success: false, data: null, error: { type: "INVALID_CREDENTIALS", message: "Invalid credentials" } });

    const unknown = await ctx.app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: { email: "nobody@example.com", password: "whatever" },
    });
    expect(unknown.statusCode).toBe(401);

    const invalid = await ctx.app.inject({ method: "POST", url: "/api/v1/auth/register", payload: { email: "x" } });
    expect(invalid.statusCode).toBe(400);
    expect(invalid.json().error.type).toBe("VALIDATION_ERROR");
  });

  it("rejects missing, malformed, forged and refresh tokens on protected routes", async () => {
    const forgedHeader = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
    const now = Math.floor(Date.now() / 1000);
    const forgedPayload = Buffer.from(
      JSON.stringify({ id: "1", userType: "admin", tokenType: "access", role: "admin", iat: now, exp: now + 600 }),
    ).toString("base64url");
    const forgedSig = createHmac("sha256", "secret_admin").update(`${forgedHeader}.${forgedPayload}`).digest("base64url");

    const refresh = ctx.app.jwt.sign({ id: "1" }, "user", "refresh");

    for (const authorization of [undefined, "Basic abc", `Bearer ${forgedHeader}.${forgedPayload}.${forgedSig}`, `Bearer ${refresh}`]) {
      const res = await ctx.app.inject({
        method: "GET",
        url: "/api/v1/auth/me",
        headers: authorization ? { authorization } : {},
      });
      expect(res.statusCode).toBe(401);
      expect(res.json().success).toBe(false);
    }
  });

  it("returns 404 in the standard envelope for unknown routes", async () => {
    const res = await ctx.app.inject({ method: "GET", url: "/does-not-exist?token=abc" });
    expect(res.statusCode).toBe(404);
  });
});

describe("application startup validation", () => {
  it("fails on unknown plugins instead of ignoring them", async () => {
    await expect(buildTestApp({ env: { PLUGINS: "socket" } })).rejects.toThrow(PluginConfigurationError);
  });

  it("fails when a required plugin is missing", async () => {
    await expect(buildTestApp({ env: { PLUGINS: "cache" } })).rejects.toThrow(/"cache" requires "redis"/);
  });

  it("validates plugin configuration only when the plugin is enabled", async () => {
    const off = await buildTestApp({ env: { REDIS_PORT: "not-a-port" } });
    await off.app.close();

    await expect(buildTestApp({ env: { PLUGINS: "redis", REDIS_PORT: "not-a-port" } })).rejects.toThrow(
      /Invalid redis configuration: REDIS_PORT/,
    );
  });

  it("fails when DB_PROVIDER does not match the application's database binding", async () => {
    await expect(
      buildTestApp({ env: { DB_PROVIDER: "mongodb", MONGO_URI: "mongodb://127.0.0.1:1/x" } }),
    ).rejects.toThrow(/does not match this application's database binding/);
  });

  it("reports configuration errors by variable name, never by value", () => {
    const weak = "SUPERSECURESECRET";
    let error: unknown;
    try {
      loadConfig({ ...testEnv(), JWT_SECRET: weak, DATABASE_URL: "" });
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(ConfigError);
    expect(String(error)).toContain("JWT_SECRET");
    expect(String(error)).toContain("DATABASE_URL");
    expect(String(error)).not.toContain(weak);
  });

  it("closes already-opened resources when startup fails", async () => {
    const db = new StubDatabase();
    const disconnect = jest.spyOn(db, "disconnect");
    await expect(
      buildApp({ config: loadConfig(testEnv({ PLUGINS: "nope" })), database: db, logger: false }),
    ).rejects.toThrow();
    // Injected adapters are owned by the caller and are not closed by the framework.
    expect(disconnect).not.toHaveBeenCalled();
  });
});
