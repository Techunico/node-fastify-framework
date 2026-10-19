import Fastify from "fastify";
import { authGuard, authorize } from "@/core/auth.guard";
import { createJwtService } from "@/core/jwt";
import { setupErrorHandler } from "@/core/error-handler";
import contextPlugin from "@/plugins/context.plugin";
import { testSecret } from "../support/test-app";

async function buildApp() {
  const app = Fastify({ logger: false });
  app.decorate(
    "jwt",
    createJwtService({ secret: testSecret(), adminSecret: testSecret(), issuer: "t", audience: "t", accessTtl: "5m", refreshTtl: "1d" }),
  );
  await app.register(contextPlugin);
  app.get("/users", { preHandler: [authGuard, authorize({ permissions: ["user.read"] })] }, async () => ({ ok: true }));
  app.get("/admin", { preHandler: [authGuard, authorize({ userTypes: ["admin"] })] }, async () => ({ ok: true }));
  app.get("/no-auth-guard", { preHandler: [authorize({ roles: ["admin"] })] }, async () => ({ ok: true }));
  setupErrorHandler(app);
  await app.ready();
  return app;
}

const get = (app: Awaited<ReturnType<typeof buildApp>>, url: string, token?: string) =>
  app.inject({ method: "GET", url, headers: token ? { authorization: `Bearer ${token}` } : {} });

describe("authorize()", () => {
  it("an admin token without the permission is forbidden (no implicit bypass)", async () => {
    const app = await buildApp();
    const admin = app.jwt.sign({ id: "1", role: "admin", permissions: [] }, "admin");
    expect((await get(app, "/users", admin)).statusCode).toBe(403);
    expect((await get(app, "/admin", admin)).statusCode).toBe(200);
    await app.close();
  });

  it("allows users that hold every required permission", async () => {
    const app = await buildApp();
    const reader = app.jwt.sign({ id: "2", role: "user", permissions: ["user.read"] }, "user");
    expect((await get(app, "/users", reader)).statusCode).toBe(200);
    expect((await get(app, "/admin", reader)).statusCode).toBe(403);
    await app.close();
  });

  it("requires authentication first", async () => {
    const app = await buildApp();
    expect((await get(app, "/no-auth-guard")).statusCode).toBe(401);
    await app.close();
  });
});
