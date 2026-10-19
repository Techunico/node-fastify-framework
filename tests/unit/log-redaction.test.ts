import { Writable } from "stream";
import Fastify from "fastify";
import { authGuard } from "@/core/auth.guard";
import { createJwtService } from "@/core/jwt";
import { loggerRedaction } from "@/core/log-redaction";
import { scrubSecrets, toSafeCause } from "@/core/safe-error";
import { setupErrorHandler } from "@/core/error-handler";
import contextPlugin from "@/plugins/context.plugin";
import { ProviderError } from "@/plugins/geo/errors";
import { GeoProviderName } from "@/plugins/geo/types";

const SECRET_TOKEN = "eyJhbGciOiJIUzI1NiJ9.c2VjcmV0LXBheWxvYWQ.c2lnbmF0dXJlLXZhbHVl";
const API_KEY = "AIzaSyD-very-secret-google-key";

function buildApp() {
  const lines: string[] = [];
  const stream = new Writable({
    write(chunk, _encoding, callback) {
      lines.push(chunk.toString());
      callback();
    },
  });

  const app = Fastify({ logger: { level: "debug", stream, redact: loggerRedaction } });
  app.decorate(
    "jwt",
    createJwtService({
      secret: "x".repeat(4) + "jwt-secret-for-redaction-tests-0123456789",
      issuer: "t",
      audience: "t",
      accessTtl: "15m",
      refreshTtl: "30d",
    }),
  );
  app.register(contextPlugin);
  app.get("/me", { preHandler: [authGuard] }, async () => ({ ok: true }));
  app.post("/echo", async (request) => {
    request.log.info({ password: "hunter2-password", apiKey: API_KEY, body: { token: SECRET_TOKEN } }, "echo");
    return { ok: true };
  });
  setupErrorHandler(app);
  return { app, lines };
}

describe("credential logging", () => {
  it.each([
    ["lower-case scheme", `bearer ${SECRET_TOKEN}`],
    ["unknown scheme", `Token ${SECRET_TOKEN}`],
    ["extra segments", `Bearer ${SECRET_TOKEN} extra`],
    ["invalid token", `Bearer ${SECRET_TOKEN}`],
  ])("never logs the Authorization header (%s)", async (_label, header) => {
    const { app, lines } = buildApp();
    const response = await app.inject({ method: "GET", url: "/me", headers: { authorization: header, cookie: "sid=session-cookie-value" } });

    expect(response.statusCode).toBe(401);
    const output = lines.join("");
    expect(output.length).toBeGreaterThan(0);
    expect(output).not.toContain(SECRET_TOKEN);
    expect(output).not.toContain("session-cookie-value");
    await app.close();
  });

  it("redacts secret-bearing fields in structured log objects", async () => {
    const { app, lines } = buildApp();
    await app.inject({ method: "POST", url: "/echo", payload: {} });
    const output = lines.join("");

    expect(output).toContain("echo");
    expect(output).not.toContain("hunter2-password");
    expect(output).not.toContain(API_KEY);
    expect(output).not.toContain(SECRET_TOKEN);
    await app.close();
  });
});

describe("provider error causes", () => {
  const axiosLikeError = Object.assign(new Error(`Request failed: https://maps.googleapis.com/api?key=${API_KEY}&latlng=1,2`), {
    name: "AxiosError",
    code: "ERR_BAD_REQUEST",
    config: { params: { key: API_KEY }, headers: { "X-Goog-Api-Key": API_KEY } },
    request: { path: `/api?key=${API_KEY}` },
    response: { status: 403, config: { params: { key: API_KEY } }, data: { error: "denied" } },
  });

  it("keeps only safe diagnostic fields", () => {
    const cause = toSafeCause(axiosLikeError);
    expect(cause).toEqual({
      name: "AxiosError",
      code: "ERR_BAD_REQUEST",
      status: 403,
      message: expect.stringContaining("key=[REDACTED]"),
    });
    expect(JSON.stringify(cause)).not.toContain(API_KEY);
  });

  it("provider errors serialized to logs contain no credentials", () => {
    const error = new ProviderError("google request failed", GeoProviderName.Google, toSafeCause(axiosLikeError));
    expect(JSON.stringify({ ...error, message: error.message })).not.toContain(API_KEY);
  });

  it("scrubs secret query parameters from free text", () => {
    expect(scrubSecrets("GET /x?token=abc&signature=def&q=1")).toBe(
      "GET /x?token=[REDACTED]&signature=[REDACTED]&q=1",
    );
  });
});
