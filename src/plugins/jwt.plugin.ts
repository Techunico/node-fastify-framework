import fp from "fastify-plugin";
import jwt from "jsonwebtoken";
import { FastifyInstance } from "fastify";
import { config } from "@/config";

type TokenType = "access" | "refresh";
type UserType = "admin" | "user" | "driver";

function getSecret(userType: UserType) {
  switch (userType) {
    case "admin":
      return "secret_admin";
    case "user":
       return config.jwt.secret || "secret_user";
    default:
      return config.jwt.secret || "secret_user";
  }
}

function getExpiry(userType: UserType, tokenType: TokenType) {
  if (tokenType === "access") return "15m";
  if (tokenType === "refresh") return "30d";
}

function signToken(
  payload: any,
  userType: UserType = "user",
  tokenType: TokenType,
) {
  const secret = getSecret(userType);
  const expiresIn = getExpiry(userType, tokenType);

  return jwt.sign({ ...payload, userType, tokenType }, secret, { expiresIn });
}

function verifyToken(token: string) {
  const decoded: any = jwt.decode(token);

  if (!decoded?.userType) {
    throw new Error("Invalid token");
  }

  const secret = getSecret(decoded.userType);
  return jwt.verify(token, secret);
}

function verifyAccessToken(token: string) {
  const decoded: any = verifyToken(token);

  if (decoded.tokenType !== "access") {
    throw new Error("Invalid access token");
  }

  return decoded;
}

function verifyRefreshToken(token: string) {
  const decoded: any = verifyToken(token);

  if (decoded.tokenType !== "refresh") {
    throw new Error("Invalid refresh token");
  }

  return decoded;
}

function refreshAccessToken(refreshToken: string) {
  const decoded = verifyRefreshToken(refreshToken);

  const accessToken = signToken(
    {
      id: decoded.id,
      role: decoded.role,
      permissions: decoded.permissions,
      type: decoded.type,
    },
    decoded.userType,
    "access",
  );

  return { accessToken };
}

async function jwtPlugin(app: FastifyInstance) {
  app.decorate("jwt", {
    sign: signToken,
    verifyToken: verifyToken,
    verifyAccess: verifyAccessToken,
    verifyRefresh: verifyRefreshToken,
    refresh: refreshAccessToken,
  });
}

export default fp(jwtPlugin);
