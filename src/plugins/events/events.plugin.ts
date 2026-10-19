import fp from 'fastify-plugin';
import { EventService } from '../../events/event.service';
import { requireDecorator } from '@/core/require-decorator';

declare module 'fastify' {
  interface FastifyInstance {
    /** Present when PLUGINS includes events. */
    event?: EventService;
  }
}

export default fp(async (app) => {
  const event = new EventService(requireDecorator(app, 'queue', 'events'));

  app.decorate('event', event);
  app.log.info('Event plugin registered');
}, { name: 'events', dependencies: ['queue'] });
