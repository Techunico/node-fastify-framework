import fp from 'fastify-plugin';
import { QueueService } from './queue.service';

declare module 'fastify' {
  interface FastifyInstance {
    queue: QueueService;
  }
}

export default fp(async (app) => {
  const queue = new QueueService(app.redis);

  app.decorate('queue', queue);
});