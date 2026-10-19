import jwt from "jsonwebtoken";
import { createJwtService, JwtConfig, JwtError } from "@/core/jwt";

const config: JwtConfig = {
  secret: "u".repeat(8) + "user-secret-for-tests-0123456789abcdef",
  adminSecret: "a".repeat(8) + "admin-secret-for-tests-0123456789abcdef",
  issuer: "techunico-test",
  audience: "techunico-test-api",
  accessTtl: "15m",
  refreshTtl: "30d",
};

const service = createJwtService(config);

const claims = { id: "42", role: "user", permissions: ["user.read"] };

function expectRejected(fn: () => unknown, code = "INVALID_TOKEN") {
  try {
    fn();
  } catch (error) {
    expect(error).toBeInstanceOf(JwtError);
    expect((error as JwtError).code).toBe(code);
    return;
  }
  throw new Error("expected token to be rejected");
}

describe("JWT service", () => {
  it("accepts a valid access token and returns its claims", () => {
    const token = service.sign(claims, "user", "access");
    const decoded = service.verifyAccess(token);

    expect(decoded.id).toBe("42");
    expect(decoded.userType).toBe("user");
    expect(decoded.tokenType).toBe("access");
    expect(decoded.iss).toBe(config.issuer);
    expect(decoded.aud).toBe(config.audience);
  });

  it("defaults to user access tokens", () => {
    const decoded = service.verifyAccess(service.sign(claims));
    expect(decoded.userType).toBe("user");
    expect(decoded.tokenType).toBe("access");
  });

  it("issues and accepts admin tokens signed with the admin key", () => {
    const token = service.sign({ id: "1", role: "admin" }, "admin", "access");
    expect(jwt.decode(token, { complete: true })?.header.kid).toBe("admin");
    expect(service.verifyAccess(token).userType).toBe("admin");
  });

  it("rejects the historical forged admin token signed with 'secret_admin'", () => {
    const forged = jwt.sign(
      { id: "1", role: "admin", permissions: ["*"], userType: "admin", tokenType: "access" },
      "secret_admin",
      { expiresIn: "15m" },
    );
    expectRejected(() => service.verifyAccess(forged));
  });

  it("rejects a forged admin token even with plausible header and claims", () => {
    const forged = jwt.sign(
      { id: "1", role: "admin", permissions: ["*"], userType: "admin", tokenType: "access" },
      "attacker-chosen-secret-that-is-long-enough",
      { keyid: "admin", issuer: config.issuer, audience: `${config.audience}:admin`, expiresIn: "15m" },
    );
    expectRejected(() => service.verifyAccess(forged));
  });

  it("rejects a forged user token", () => {
    const forged = jwt.sign(
      { id: "7", userType: "user", tokenType: "access" },
      "wrong-secret-wrong-secret-wrong-secret",
      { keyid: "user", issuer: config.issuer, audience: config.audience, expiresIn: "15m" },
    );
    expectRejected(() => service.verifyAccess(forged));
  });

  it("does not let a user-key token claim admin userType", () => {
    // Attacker who somehow holds the *user* key still cannot mint admin tokens.
    const escalated = jwt.sign(
      { id: "7", userType: "admin", tokenType: "access" },
      config.secret,
      { keyid: "user", issuer: config.issuer, audience: config.audience, expiresIn: "15m" },
    );
    expectRejected(() => service.verifyAccess(escalated));
  });

  it("does not accept an admin-audience token signed with the user key", () => {
    const token = jwt.sign(
      { id: "7", userType: "admin", tokenType: "access" },
      config.secret,
      { keyid: "admin", issuer: config.issuer, audience: `${config.audience}:admin`, expiresIn: "15m" },
    );
    expectRejected(() => service.verifyAccess(token));
  });

  it("rejects tokens without a known key id", () => {
    const token = jwt.sign(
      { id: "7", userType: "user", tokenType: "access" },
      config.secret,
      { issuer: config.issuer, audience: config.audience, expiresIn: "15m" },
    );
    expectRejected(() => service.verifyAccess(token));
  });

  it("rejects algorithms other than HS256", () => {
    const token = jwt.sign(
      { id: "7", userType: "user", tokenType: "access" },
      config.secret,
      { algorithm: "HS512", keyid: "user", issuer: config.issuer, audience: config.audience, expiresIn: "15m" },
    );
    expectRejected(() => service.verifyAccess(token));
  });

  it("rejects unsigned (alg=none) tokens", () => {
    const header = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT", kid: "user" })).toString("base64url");
    const payload = Buffer.from(
      JSON.stringify({ id: "7", userType: "user", tokenType: "access", iss: config.issuer, aud: config.audience, exp: Math.floor(Date.now() / 1000) + 600 }),
    ).toString("base64url");
    expectRejected(() => service.verifyAccess(`${header}.${payload}.`));
  });

  it("rejects wrong issuer and wrong audience", () => {
    const wrongIssuer = jwt.sign({ id: "7", userType: "user", tokenType: "access" }, config.secret, {
      keyid: "user", issuer: "someone-else", audience: config.audience, expiresIn: "15m",
    });
    const wrongAudience = jwt.sign({ id: "7", userType: "user", tokenType: "access" }, config.secret, {
      keyid: "user", issuer: config.issuer, audience: "other-api", expiresIn: "15m",
    });
    expectRejected(() => service.verifyAccess(wrongIssuer));
    expectRejected(() => service.verifyAccess(wrongAudience));
  });

  it("rejects tokens without expiry", () => {
    const token = jwt.sign({ id: "7", userType: "user", tokenType: "access" }, config.secret, {
      keyid: "user", issuer: config.issuer, audience: config.audience,
    });
    expectRejected(() => service.verifyAccess(token));
  });

  it("rejects expired tokens with TOKEN_EXPIRED", () => {
    const token = jwt.sign(
      { id: "7", userType: "user", tokenType: "access", exp: Math.floor(Date.now() / 1000) - 60 },
      config.secret,
      { keyid: "user", issuer: config.issuer, audience: config.audience },
    );
    expectRejected(() => service.verifyAccess(token), "TOKEN_EXPIRED");
  });

  it("access verification rejects refresh tokens and vice versa", () => {
    const refresh = service.sign(claims, "user", "refresh");
    const access = service.sign(claims, "user", "access");
    expectRejected(() => service.verifyAccess(refresh));
    expectRejected(() => service.verifyRefresh(access));
  });

  it("rejects unknown token types", () => {
    const token = jwt.sign({ id: "7", userType: "user", tokenType: "magic" }, config.secret, {
      keyid: "user", issuer: config.issuer, audience: config.audience, expiresIn: "15m",
    });
    expectRejected(() => service.verifyToken(token));
  });

  it("caller-supplied payload cannot override reserved claims", () => {
    const token = service.sign(
      { id: "7", userType: "admin", tokenType: "refresh", iss: "evil", aud: "evil" } as never,
      "user",
      "access",
    );
    const decoded = service.verifyAccess(token);
    expect(decoded.userType).toBe("user");
    expect(decoded.tokenType).toBe("access");
    expect(decoded.iss).toBe(config.issuer);
  });

  it("refresh() issues an access token of the same class", () => {
    const refreshToken = service.sign(claims, "driver", "refresh");
    const { accessToken } = service.refresh(refreshToken);
    const decoded = service.verifyAccess(accessToken);
    expect(decoded.userType).toBe("driver");
    expect(decoded.id).toBe("42");
  });

  it("refuses to issue admin tokens when no admin secret is configured", () => {
    const userOnly = createJwtService({ ...config, adminSecret: undefined });
    expect(() => userOnly.sign({ id: "1" }, "admin")).toThrow(/JWT_ADMIN_SECRET/);
    const adminToken = service.sign({ id: "1" }, "admin");
    expectRejected(() => userOnly.verifyAccess(adminToken));
  });

  it("fails fast on missing or reused secrets", () => {
    expect(() => createJwtService({ ...config, secret: "" })).toThrow(/JWT_SECRET/);
    expect(() => createJwtService({ ...config, adminSecret: config.secret })).toThrow(/differ/);
  });
});
