import fp from "fastify-plugin";
import helmet from "@fastify/helmet";
import cors from "@fastify/cors";
import rateLimit, { RateLimitPluginOptions } from "@fastify/rate-limit";
import { AppError } from "@/utils/app-error";

/** Probe endpoints are never rate limited. */
const UNLIMITED_ROUTES = new Set(["/health", "/ready", "/metrics"]);

/**
 * HTTP safeguards: security headers, CORS and rate limiting.
 * Registered after optional plugins (to reuse Redis) and before modules.
 */
export default fp(async (app) => {
  const { http } = app.config;

  await app.register(helmet, {
    // JSON API: no HTML is served, so the default CSP is fine; keep
    // cross-origin resource policy permissive enough for API clients.
    crossOriginResourcePolicy: { policy: "same-site" },
  });

  if (http.cors.origins !== null) {
    await app.register(cors, {
      origin: http.cors.origins,
      credentials: http.cors.credentials,
    });
  }

  // The redis decorator only exists (and is only typed) when the redis plugin
  // is part of the application, so read it through Fastify's decorator API.
  const redis = app.hasDecorator("redis")
    ? (app.getDecorator("redis") as RateLimitPluginOptions["redis"])
    : undefined;

  if (http.rateLimit.enabled) {
    await app.register(rateLimit, {
      global: true,
      max: http.rateLimit.max,
      timeWindow: http.rateLimit.timeWindow,
      // Distributed counters when Redis is enabled; in-memory otherwise.
      redis,
      nameSpace: "techunico-rl:",
      // A Redis outage must not take the API down.
      skipOnError: true,
      allowList: (request) => UNLIMITED_ROUTES.has(request.routeOptions.url ?? ""),
      errorResponseBuilder: (_request, context) =>
        Object.assign(new AppError("Too many requests, please retry later", 429, "RATE_LIMITED"), {
          retryAfter: context.after,
        }),
    });
  }

  app.log.debug(
    {
      cors: http.cors.origins === null ? "disabled" : http.cors.origins === true ? "any origin (development)" : http.cors.origins,
      rateLimit: http.rateLimit.enabled ? { max: http.rateLimit.max, store: redis ? "redis" : "memory" } : "disabled",
    },
    "HTTP safeguards configured",
  );
}, { name: "security" });
