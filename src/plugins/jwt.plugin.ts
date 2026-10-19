import fp from "fastify-plugin";
import { FastifyInstance } from "fastify";
import { createJwtService, JwtConfig } from "@/core/jwt";

export interface JwtPluginOptions {
  config?: JwtConfig;
}

async function jwtPlugin(app: FastifyInstance, options: JwtPluginOptions) {
  app.decorate("jwt", createJwtService(options.config ?? app.config.jwt));
}

export default fp(jwtPlugin, { name: "jwt" });
