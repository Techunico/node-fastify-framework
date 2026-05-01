import fp from "fastify-plugin";
import { PrismaClient } from "@/generated/prisma/client";
import { AuthService } from "@/modules/auth/auth.service";

export default fp(async (app) => {
  app.decorateRequest("services", null);

  app.addHook("onRequest", async (request) => {
    request.services = {}; // empty container
  });
});
