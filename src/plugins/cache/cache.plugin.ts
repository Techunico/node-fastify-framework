import fp from 'fastify-plugin';
import { CacheService } from './cache.service';

declare module 'fastify' {
  interface FastifyInstance {
    cache: CacheService;
  }
}

export default fp(async (app) => {
  const cache = new CacheService(app.redis);

  app.decorate('cache', cache);
});