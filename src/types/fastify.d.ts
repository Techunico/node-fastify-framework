import "fastify";
import { Logger } from "pino";
import { PrismaClient } from "../generated/prisma";
import { RequestContext } from "./request-context";
import { Services } from "./services";

declare module "fastify" {
  interface FastifyInstance {
    logger: Logger;
    prisma: PrismaClient;
    jwt: {
      sign: (payload: any) => string;
      verify: (token: string) => any;
    };
  }

  interface FastifyReply {
    success: (data: any, statusCode?: number) => void;
    error: (error: any, statusCode?: number) => void;
  }

  interface FastifyRequest {
    user?: any;
    requestId: string;
    ctx: RequestContext;
    services: Services;
    startTime: [number, number];
  }
}
