import fp from "fastify-plugin";
import jwt from "jsonwebtoken";
import { FastifyInstance } from "fastify";
import { config } from "@/config";

async function jwtPlugin(app: FastifyInstance) {
  const secret = config.jwt.secret;

  app.decorate("jwt", {
    sign(payload: any) {
      return jwt.sign(payload, secret, { expiresIn: "7d" });
    },

    verify(token: string) {
      return jwt.verify(token, secret);
    },
  });
}

export default fp(jwtPlugin);
