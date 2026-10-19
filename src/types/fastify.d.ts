import "fastify";
import { RequestContext } from "./request-context";
import { Services } from "./services";
import type { JwtService } from "../core/jwt";
import type { AppDatabase } from "../plugins/database";
import type { ReadinessRegistry } from "../core/readiness";

/**
 * Core decorations only. Optional plugins declare their own (optional)
 * decorations next to their implementation, so a decoration's type exists
 * exactly when the plugin's code is part of the application.
 */
declare module "fastify" {
  interface FastifyInstance {
    db: AppDatabase;
    jwt: JwtService;
    /** Readiness checks run by GET /ready; plugins add their own. */
    readiness: ReadinessRegistry;
  }

  interface FastifyReply {
    success: (data: any, statusCode?: number) => void;
    error: (error: any, statusCode?: number) => void;
  }

  interface FastifyRequest {
    ctx: RequestContext;
    services: Services;
    startTime: [number, number];
  }
}
