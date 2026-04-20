export function rateLimitMiddleware(limit: number, windowSec: number) {
  return async (request:any, reply:any) => {
    const user = request.ctx.user;

    const key = `ratelimit:api:${user.tenantId}:${user.id}:${request.routerPath}`;

    const result = await request.server.rateLimit.hit(
      key,
      limit,
      windowSec
    );

    if (!result.allowed) {
      return reply.status(429).send({
        message: 'Too many requests',
      });
    }
  };
}