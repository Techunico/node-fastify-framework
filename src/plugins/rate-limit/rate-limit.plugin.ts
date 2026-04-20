import fp from 'fastify-plugin';
import { RateLimitService } from './rate-limit.service';

declare module 'fastify' {
  interface FastifyInstance {
    rateLimit: RateLimitService;
  }
}

export default fp(async (app) => {
  const service = new RateLimitService(app.redis);
  app.decorate('rateLimit', service);
});