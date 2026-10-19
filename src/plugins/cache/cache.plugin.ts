import fp from 'fastify-plugin';
import { CacheService } from './cache.service';
import { requireDecorator } from '@/core/require-decorator';

declare module 'fastify' {
  interface FastifyInstance {
    /** Present when PLUGINS includes cache. */
    cache?: CacheService;
  }
}

export default fp(async (app) => {
  const cache = new CacheService(requireDecorator(app, 'redis', 'cache'));

  app.decorate('cache', cache);
}, { name: 'cache', dependencies: ['redis'] });
