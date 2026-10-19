import type { FastifyReply, FastifyRequest } from 'fastify';

/**
 * EXPERIMENTAL — per-user limiter for authenticated routes, built on the
 * experimental rate-limit store. Not wired by the framework.
 */
export function rateLimitMiddleware(limit: number, windowSec: number) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.ctx.user;
    const store = request.server.rateLimitStore;

    if (!user || !store) return;

    const route = request.routeOptions.url ?? 'unmatched';
    const key = `ratelimit:api:${user.id}:${route}`;

    const result = await store.hit(key, limit, windowSec);

    if (!result.allowed) {
      return reply.status(429).send({
        message: 'Too many requests',
      });
    }
  };
}
