import fp from 'fastify-plugin';
import { EventService } from '../../events/event.service';

declare module 'fastify' {
  interface FastifyInstance {
    event: EventService;
  }
}

export default fp(async (app) => {
  const event = new EventService(app.queue);

  app.decorate('event', event);
});