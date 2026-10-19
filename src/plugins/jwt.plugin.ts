import fp from "fastify-plugin";
import { FastifyInstance } from "fastify";
import { config } from "@/config";
import { createJwtService, JwtConfig } from "@/core/jwt";

export interface JwtPluginOptions {
  config?: JwtConfig;
}

async function jwtPlugin(app: FastifyInstance, options: JwtPluginOptions) {
  app.decorate("jwt", createJwtService(options.config ?? config.jwt));
}

export default fp(jwtPlugin, { name: "jwt" });
