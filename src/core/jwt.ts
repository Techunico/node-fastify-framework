import jwt, { TokenExpiredError } from "jsonwebtoken";

export type TokenType = "access" | "refresh";
export type UserType = "admin" | "user" | "driver";

/**
 * Key class. Every signed token carries its class in the `kid` header so the
 * verifier can pick the key from a server-side map. The class is then
 * re-checked against the verified `userType` claim, so a token signed with the
 * user key can never be accepted as an admin token (and vice versa).
 */
export type TokenClass = "user" | "admin";

export interface JwtConfig {
  /** Signs user/driver tokens. Required. */
  secret: string;
  /** Signs admin tokens. When absent, admin tokens can be neither issued nor accepted. */
  adminSecret?: string;
  issuer: string;
  audience: string;
  accessTtl: string;
  refreshTtl: string;
}

export interface TokenClaims {
  id: string | number;
  role?: string | null;
  permissions?: string[];
  type?: string;
  [claim: string]: unknown;
}

export interface VerifiedToken extends TokenClaims {
  userType: UserType;
  tokenType: TokenType;
  iat: number;
  exp: number;
  iss: string;
  aud: string;
}

export type JwtErrorCode = "INVALID_TOKEN" | "TOKEN_EXPIRED";

export class JwtError extends Error {
  constructor(
    message: string,
    public readonly code: JwtErrorCode = "INVALID_TOKEN",
  ) {
    super(message);
    this.name = "JwtError";
  }
}

const ALGORITHM = "HS256" as const;
const USER_TYPES: readonly UserType[] = ["admin", "user", "driver"];
const TOKEN_TYPES: readonly TokenType[] = ["access", "refresh"];
const RESERVED_CLAIMS = ["userType", "tokenType", "iat", "exp", "nbf", "iss", "aud", "sub", "jti"];

const isUserType = (value: unknown): value is UserType =>
  typeof value === "string" && (USER_TYPES as readonly string[]).includes(value);

const isTokenType = (value: unknown): value is TokenType =>
  typeof value === "string" && (TOKEN_TYPES as readonly string[]).includes(value);

const classOf = (userType: UserType): TokenClass => (userType === "admin" ? "admin" : "user");

function withoutReservedClaims(payload: Record<string, unknown>): Record<string, unknown> {
  const claims: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(payload)) {
    if (!RESERVED_CLAIMS.includes(key)) claims[key] = value;
  }
  return claims;
}

export function createJwtService(config: JwtConfig) {
  if (!config.secret) {
    throw new Error("JWT_SECRET is required");
  }
  if (config.adminSecret && config.adminSecret === config.secret) {
    throw new Error("JWT_ADMIN_SECRET must differ from JWT_SECRET");
  }

  const keys: Record<TokenClass, string | undefined> = {
    user: config.secret,
    admin: config.adminSecret || undefined,
  };

  const audienceOf = (tokenClass: TokenClass) =>
    tokenClass === "admin" ? `${config.audience}:admin` : config.audience;

  function sign(
    payload: TokenClaims,
    userType: UserType = "user",
    tokenType: TokenType = "access",
  ): string {
    if (!isUserType(userType)) throw new Error(`Unsupported userType: ${String(userType)}`);
    if (!isTokenType(tokenType)) throw new Error(`Unsupported tokenType: ${String(tokenType)}`);

    const tokenClass = classOf(userType);
    const key = keys[tokenClass];
    if (!key) {
      throw new Error("JWT_ADMIN_SECRET is not configured; admin tokens cannot be issued");
    }

    return jwt.sign({ ...withoutReservedClaims(payload), userType, tokenType }, key, {
      algorithm: ALGORITHM,
      keyid: tokenClass,
      issuer: config.issuer,
      audience: audienceOf(tokenClass),
      expiresIn: (tokenType === "access" ? config.accessTtl : config.refreshTtl) as jwt.SignOptions["expiresIn"],
    });
  }

  function verifyToken(token: string): VerifiedToken {
    if (typeof token !== "string" || token.length === 0) {
      throw new JwtError("Invalid token");
    }

    // Only the header's key id is read before verification, and it can only
    // select one of the keys configured on the server.
    const kid = jwt.decode(token, { complete: true })?.header.kid;
    if (kid !== "user" && kid !== "admin") throw new JwtError("Invalid token");

    const key = keys[kid];
    if (!key) throw new JwtError("Invalid token");

    let payload: unknown;
    try {
      payload = jwt.verify(token, key, {
        algorithms: [ALGORITHM],
        issuer: config.issuer,
        audience: audienceOf(kid),
      });
    } catch (error) {
      if (error instanceof TokenExpiredError) throw new JwtError("Token expired", "TOKEN_EXPIRED");
      throw new JwtError("Invalid token");
    }

    if (!payload || typeof payload !== "object") throw new JwtError("Invalid token");
    const claims = payload as Record<string, unknown>;

    if (!isUserType(claims.userType) || classOf(claims.userType) !== kid) {
      throw new JwtError("Invalid token");
    }
    if (!isTokenType(claims.tokenType)) throw new JwtError("Invalid token");
    if (typeof claims.exp !== "number") throw new JwtError("Invalid token");
    if (claims.id === undefined || claims.id === null) throw new JwtError("Invalid token");

    return claims as unknown as VerifiedToken;
  }

  function verifyAccess(token: string): VerifiedToken {
    const decoded = verifyToken(token);
    if (decoded.tokenType !== "access") throw new JwtError("Invalid access token");
    return decoded;
  }

  function verifyRefresh(token: string): VerifiedToken {
    const decoded = verifyToken(token);
    if (decoded.tokenType !== "refresh") throw new JwtError("Invalid refresh token");
    return decoded;
  }

  function refresh(refreshToken: string): { accessToken: string } {
    const decoded = verifyRefresh(refreshToken);
    const claims = withoutReservedClaims(decoded) as TokenClaims;
    return { accessToken: sign(claims, decoded.userType, "access") };
  }

  return { sign, verifyToken, verifyAccess, verifyRefresh, refresh };
}

export type JwtService = ReturnType<typeof createJwtService>;
