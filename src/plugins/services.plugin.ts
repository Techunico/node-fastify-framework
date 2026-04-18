import fp from "fastify-plugin";
import { PrismaClient } from "@/generated/prisma/client";
import { AuthService } from "@/modules/auth/auth.service";

export default fp(async (app) => {
  app.addHook("onRequest", async (request) => {
    const prisma = app.prisma;

    request.services = {
      prisma,

      auth: new AuthService(prisma, request.ctx),
    };
  });
});
