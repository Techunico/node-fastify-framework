import fp from 'fastify-plugin';
import { RateLimitService } from './rate-limit.service';
import { requireDecorator } from '@/core/require-decorator';

declare module 'fastify' {
  interface FastifyInstance {
    /** Named `rateLimitStore` to avoid clashing with @fastify/rate-limit's `rateLimit` decorator. */
    rateLimitStore?: RateLimitService;
  }
}

/**
 * EXPERIMENTAL — not registered by the framework and not shipped in generated
 * applications. HTTP rate limiting is provided by @fastify/rate-limit.
 */
export default fp(async (app) => {
  const service = new RateLimitService(requireDecorator(app, 'redis', 'rate-limit-store'));
  app.decorate('rateLimitStore', service);
}, { name: 'rate-limit-store', dependencies: ['redis'] });
