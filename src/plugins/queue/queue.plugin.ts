import fp from 'fastify-plugin';
import { QueueService } from './queue.service';
import { requireDecorator } from '@/core/require-decorator';

declare module 'fastify' {
  interface FastifyInstance {
    /** Present when PLUGINS includes queue. */
    queue?: QueueService;
  }
}

export default fp(async (app) => {
  const queue = new QueueService(requireDecorator(app, 'redis', 'queue'));

  app.decorate('queue', queue);

  // Registered after redis, so this runs before the Redis connection is closed.
  app.addHook('onClose', async () => {
    await queue.close();
  });
}, { name: 'queue', dependencies: ['redis'] });
