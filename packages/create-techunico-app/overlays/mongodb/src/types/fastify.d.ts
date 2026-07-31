import "fastify";
import { Logger } from "pino";
import { RequestContext } from "./request-context";
import { Services } from "./services";
import type { CloudinaryService } from "../plugins/cloudinary/cloudinary.service";
import type { GeoService } from "../plugins/geo/service";
import type { PaymentService } from "../plugins/payment/service";

declare module "fastify" {
  interface FastifyInstance {
    logger: Logger;
    db: {
      connect(): Promise<void>;
      disconnect(): Promise<void>;
      getClient(): unknown;
      isConnected?(): boolean;
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

    /** Present when PLUGINS includes cloudinary. */
    cloudinary?: CloudinaryService;

    /** Present when PLUGINS includes geo. */
    geo?: GeoService;

    /** Present when PLUGINS includes payment. */
    payment?: PaymentService;
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
