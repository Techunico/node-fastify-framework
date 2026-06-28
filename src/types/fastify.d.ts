import "fastify";
import { Logger } from "pino";
import { PrismaClient } from "../generated/prisma";
import { RequestContext } from "./request-context";
import { Services } from "./services";

declare module "fastify" {
  interface FastifyInstance {
    logger: Logger;
    prisma: PrismaClient;
    db: {
      connect(): Promise<void>;
      disconnect(): Promise<void>;
      getClient(): any;
    };
    jwt: {
      sign: (payload: any, userType: UserType, tokenType: TokenType) => string;
      verifyToken: (token: string) => any;
      verifyAccess: (token: string) => any;
      verifyRefresh: (token: string) => any;
      refresh: (refreshToken: string) => {
        accessToken: string;
      };
    };

    cloudinary: CloudinaryService;
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
