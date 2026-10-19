import { randomUUID } from "crypto";
import { IncomingMessage } from "http";
import Fastify, { FastifyServerOptions } from "fastify";
import { setupPlugins } from "./core/register-plugins";
import { setupErrorHandler } from "./core/error-handler";
import { registerModules } from "@/core/module-loader";
import { buildLoggerOptions } from "@/config/logger";
import type { AppConfig } from "@/config";
import type { RegisterPluginsOptions } from "@/plugins";

export interface BuildAppOptions extends RegisterPluginsOptions {
  /** Validated configuration, normally `loadConfig()` called by the entry point. */
  config: AppConfig;
  /** Override logger options (e.g. a capture stream in tests). */
  logger?: FastifyServerOptions["logger"];
}

const REQUEST_ID_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/;

/** Accepts only short, log-safe incoming request IDs. */
export function requestIdFrom(request: IncomingMessage): string {
  const header = request.headers["x-request-id"];
  return typeof header === "string" && REQUEST_ID_PATTERN.test(header) ? header : randomUUID();
}

export async function buildApp(options: BuildAppOptions) {
  const app = Fastify({
    logger: options.logger ?? buildLoggerOptions(options.config),
    // Explicit: only trust X-Forwarded-* from configured proxies (TRUST_PROXY).
    trustProxy: options.config.http.trustProxy,
    // Request IDs: reuse a well-formed incoming x-request-id, otherwise generate one.
    requestIdHeader: false,
    requestIdLogLabel: "requestId",
    genReqId: requestIdFrom,
  });

  app.decorate("config", options.config);

  // Must be set before plugins and modules: encapsulated contexts inherit the
  // error handler that exists when they are registered.
  setupErrorHandler(app);

  try {
    await setupPlugins(app, { database: options.database, services: options.services });
    await registerModules(app);
    await app.ready();
  } catch (error) {
    // Release anything already opened (database pool, redis) before failing.
    await app.close().catch(() => undefined);
    throw error;
  }

  return app;
}
