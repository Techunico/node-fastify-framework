/**
 * Core Fastify decorations. This is a regular (type-checked) module, not a
 * .d.ts file. Optional plugins declare their own optional decorations next
 * to their implementation, so a decoration's type exists exactly when the
 * plugin's code is part of the application.
 */
import "fastify";
import type { AppConfig } from "../config";
import type { JwtService } from "../core/jwt";
import type { ReadinessRegistry } from "../core/readiness";
import type { AppDatabase } from "../plugins/database";
import type { RequestContext } from "./request-context";
import type { Services } from "./services";

declare module "fastify" {
  interface FastifyInstance {
    config: AppConfig;
    db: AppDatabase;
    jwt: JwtService;
    /** Readiness checks run by GET /ready; plugins add their own. */
    readiness: ReadinessRegistry;
    services: Services;
  }

  interface FastifyReply {
    success: (data: unknown, statusCode?: number) => FastifyReply;
    error: (error: unknown, statusCode?: number) => FastifyReply;
  }

  interface FastifyRequest {
    ctx: RequestContext;
    services: Services;
    startTime: [number, number];
  }
}
