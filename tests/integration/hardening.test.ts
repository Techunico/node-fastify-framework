import { loadConfig, ConfigError } from "@/config";
import { GeoError, GeoErrorCode, InvalidCoordinatesError, ProviderTimeoutError } from "@/plugins/geo/errors";
import { GeoProviderName } from "@/plugins/geo/types";
import { PaymentGatewayError, PaymentInvalidSignatureError } from "@/plugins/payment/errors";
import { CloudinaryInvalidInputError, CloudinaryNotConfiguredError } from "@/plugins/cloudinary/errors";
import { PaymentGatewayName } from "@/plugins/payment/types";
import { buildTestApp, testEnv } from "../support/test-app";
import { AuthService } from "@/modules/auth/auth.service";
import { UserService } from "@/modules/user/user.service";

describe("metrics", () => {
  it("labels unmatched requests with a fixed route, never the raw URL", async () => {
    const { app } = await buildTestApp();
    await app.inject({ method: "GET", url: "/scan/a1b2c3?token=abc" });
    await app.inject({ method: "GET", url: "/scan/zzz" });
    const res = await app.inject({ method: "GET", url: "/metrics" });

    expect(res.statusCode).toBe(200);
    expect(res.body).toContain('route="__unmatched__"');
    expect(res.body).not.toContain("/scan/");
    expect(res.body).not.toContain("token=abc");
    await app.close();
  });

  it("requires the bearer token when METRICS_TOKEN is set", async () => {
    const token = "metrics-token-0123456789";
    const { app } = await buildTestApp({ env: { METRICS_TOKEN: token } });
    expect((await app.inject({ method: "GET", url: "/metrics" })).statusCode).toBe(401);
    expect((await app.inject({ method: "GET", url: "/metrics", headers: { authorization: "Bearer wrong-token-xxxxxxxx" } })).statusCode).toBe(401);
    expect((await app.inject({ method: "GET", url: "/metrics", headers: { authorization: `Bearer ${token}` } })).statusCode).toBe(200);
    await app.close();
  });

  it("is not exposed when METRICS_ENABLED=false", async () => {
    const { app } = await buildTestApp({ env: { METRICS_ENABLED: "false" } });
    expect((await app.inject({ method: "GET", url: "/metrics" })).statusCode).toBe(404);
    await app.close();
  });
});

describe("HTTP safeguards", () => {
  it("sets security headers", async () => {
    const { app } = await buildTestApp();
    const res = await app.inject({ method: "GET", url: "/health" });
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.headers["strict-transport-security"]).toBeDefined();
    await app.close();
  });

  it("allows only configured CORS origins", async () => {
    const { app } = await buildTestApp({ env: { CORS_ORIGINS: "https://app.example.com" } });
    const allowed = await app.inject({ method: "GET", url: "/health", headers: { origin: "https://app.example.com" } });
    const denied = await app.inject({ method: "GET", url: "/health", headers: { origin: "https://evil.example.com" } });
    expect(allowed.headers["access-control-allow-origin"]).toBe("https://app.example.com");
    expect(denied.headers["access-control-allow-origin"]).toBeUndefined();
    await app.close();
  });

  it("sends no CORS headers outside development unless configured", async () => {
    const { app } = await buildTestApp();
    const res = await app.inject({ method: "GET", url: "/health", headers: { origin: "https://evil.example.com" } });
    expect(res.headers["access-control-allow-origin"]).toBeUndefined();
    await app.close();
  });

  it("rate limits login per client and returns the standard envelope", async () => {
    const { app } = await buildTestApp({ env: { AUTH_RATE_LIMIT_MAX: "3" } });
    const attempt = () =>
      app.inject({ method: "POST", url: "/api/v1/auth/login", payload: { email: "a@example.com", password: "x" } });

    for (let i = 0; i < 3; i += 1) expect((await attempt()).statusCode).toBe(401);
    const limited = await attempt();
    expect(limited.statusCode).toBe(429);
    expect(limited.json()).toMatchObject({ success: false, error: { type: "RATE_LIMITED" } });
    expect(limited.headers["retry-after"]).toBeDefined();

    // Probes are never limited.
    for (let i = 0; i < 5; i += 1) expect((await app.inject({ method: "GET", url: "/health" })).statusCode).toBe(200);
    await app.close();
  });

  it("honours TRUST_PROXY for client IP resolution", async () => {
    const { app } = await buildTestApp({ env: { TRUST_PROXY: "true", AUTH_RATE_LIMIT_MAX: "1" } });
    const login = (ip: string) =>
      app.inject({ method: "POST", url: "/api/v1/auth/login", headers: { "x-forwarded-for": ip }, payload: { email: "a@example.com", password: "x" } });
    expect((await login("10.0.0.1")).statusCode).toBe(401);
    expect((await login("10.0.0.1")).statusCode).toBe(429);
    expect((await login("10.0.0.2")).statusCode).toBe(401);
    await app.close();
  });
});

describe("configuration rules", () => {
  it("rejects wildcard CORS and unprotected metrics in production", () => {
    expect(() => loadConfig(testEnv({ NODE_ENV: "production", CORS_ORIGINS: "*", METRICS_PUBLIC: "true" }))).toThrow(/CORS_ORIGINS/);
    expect(() => loadConfig(testEnv({ NODE_ENV: "production" }))).toThrow(/METRICS_TOKEN/);
    expect(() => loadConfig(testEnv({ NODE_ENV: "production", METRICS_ENABLED: "false" }))).not.toThrow();
  });

  it("rejects an admin secret equal to the user secret", () => {
    const env = testEnv();
    expect(() => loadConfig({ ...env, JWT_ADMIN_SECRET: env.JWT_SECRET })).toThrow(ConfigError);
  });
});

describe("error contract", () => {
  const errors: Array<[string, Error, number, string]> = [
    ["invalid coordinates", new InvalidCoordinatesError(), 400, GeoErrorCode.InvalidCoordinates],
    ["geo provider timeout", new ProviderTimeoutError(GeoProviderName.Google, 5000), 504, GeoErrorCode.ProviderTimeout],
    ["generic geo error", new GeoError("internal detail"), 500, GeoErrorCode.Geo],
    ["invalid payment signature", new PaymentInvalidSignatureError(), 400, "PAYMENT_INVALID_SIGNATURE"],
    ["payment gateway failure", new PaymentGatewayError("razorpay said: key rzp_live_secret", PaymentGatewayName.Razorpay), 502, "PAYMENT_GATEWAY_ERROR"],
    ["cloudinary invalid input", new CloudinaryInvalidInputError("publicId is required"), 400, "CLOUDINARY_INVALID_INPUT"],
    ["cloudinary not configured", new CloudinaryNotConfiguredError(), 503, "CLOUDINARY_NOT_CONFIGURED"],
    ["unexpected error", new Error("db password=hunter2"), 500, "INTERNAL_SERVER_ERROR"],
  ];

  async function appThrowing(error: Error, nodeEnv: string) {
    const users = new UserService({ findAll: async () => { throw error; } } as never);
    return buildTestApp({
      env: { NODE_ENV: nodeEnv, METRICS_PUBLIC: "true" },
      services: { users, auth: new AuthService({} as never) },
    });
  }

  it.each(errors)("maps %s to %i", async (_label, error, status, type) => {
    const { app } = await appThrowing(error, "production");
    const res = await app.inject({ method: "GET", url: "/api/v1/user" });
    expect(res.statusCode).toBe(status);
    expect(res.json()).toMatchObject({ success: false, data: null, error: { type } });
    if (status >= 500) {
      expect(res.json().error.message).toBe("Something went wrong");
    } else {
      expect(res.json().error.message).toBe(error.message);
    }
    await app.close();
  });

  it("shows internal messages outside production only", async () => {
    const { app } = await appThrowing(new Error("detailed failure"), "test");
    expect((await app.inject({ method: "GET", url: "/api/v1/user" })).json().error.message).toBe("detailed failure");
    await app.close();
  });

  it("404s use the envelope and never echo the URL", async () => {
    const { app } = await buildTestApp();
    const res = await app.inject({ method: "GET", url: "/nope?token=secret-token" });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toMatchObject({ success: false, error: { type: "NOT_FOUND" } });
    expect(res.body).not.toContain("secret-token");
    await app.close();
  });
});

describe("TRUST_PROXY hop count", () => {
  it("trusts only the configured number of proxy hops", async () => {
    const { app } = await buildTestApp({ env: { TRUST_PROXY: "1", AUTH_RATE_LIMIT_MAX: "1" } });
    const login = (forwardedFor: string) =>
      app.inject({
        method: "POST",
        url: "/api/v1/auth/login",
        headers: { "x-forwarded-for": forwardedFor },
        payload: { email: "a@example.com", password: "x" },
      });
    // With one trusted hop the client is the last forwarded address.
    expect((await login("1.1.1.1, 10.0.0.1")).statusCode).toBe(401);
    expect((await login("2.2.2.2, 10.0.0.1")).statusCode).toBe(429);
    expect((await login("2.2.2.2, 10.0.0.2")).statusCode).toBe(401);
    await app.close();
  });
});

describe("request IDs", () => {
  it("echoes a well-formed incoming x-request-id and uses it in logs", async () => {
    const { app, logs } = await buildTestApp();
    const res = await app.inject({ method: "GET", url: "/health", headers: { "x-request-id": "req-abc.123" } });
    expect(res.headers["x-request-id"]).toBe("req-abc.123");
    expect(logs.text()).toContain('"requestId":"req-abc.123"');
    await app.close();
  });

  it("replaces malformed or oversized incoming IDs", async () => {
    const { app } = await buildTestApp();
    for (const bad of ["has spaces", "x".repeat(200), "line\\nbreak", "<script>"]) {
      const res = await app.inject({ method: "GET", url: "/health", headers: { "x-request-id": bad } });
      expect(res.headers["x-request-id"]).not.toBe(bad);
      expect(res.headers["x-request-id"]).toMatch(/^[0-9a-f-]{36}$/);
    }
    await app.close();
  });
});
