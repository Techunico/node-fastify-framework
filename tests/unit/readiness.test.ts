import { ReadinessRegistry } from "@/core/readiness";

describe("ReadinessRegistry", () => {
  it("is ready when every check passes", async () => {
    const registry = new ReadinessRegistry();
    registry.add("database", async () => undefined);
    registry.add("redis", async () => undefined);

    await expect(registry.run()).resolves.toMatchObject({
      ready: true,
      checks: { database: { status: "ok" }, redis: { status: "ok" } },
    });
  });

  it("reports failures without leaking error details in the result", async () => {
    const registry = new ReadinessRegistry();
    registry.add("database", async () => {
      throw new Error("connect ECONNREFUSED postgres://user:hunter2@db");
    });

    const result = await registry.run();
    expect(result.ready).toBe(false);
    expect(result.checks.database).toEqual({ status: "fail", message: "database unreachable" });
    expect(JSON.stringify(result.checks)).not.toContain("hunter2");
    expect(result.errors.database).toBeInstanceOf(Error);
  });

  it("times out a hanging check instead of hanging the probe", async () => {
    const registry = new ReadinessRegistry(50);
    registry.add("redis", () => new Promise(() => undefined));

    const started = Date.now();
    const result = await registry.run();
    expect(Date.now() - started).toBeLessThan(1_000);
    expect(result.checks.redis.status).toBe("fail");
  });

  it("rejects duplicate check names", () => {
    const registry = new ReadinessRegistry();
    registry.add("database", async () => undefined);
    expect(() => registry.add("database", async () => undefined)).toThrow(/already registered/);
  });
});
