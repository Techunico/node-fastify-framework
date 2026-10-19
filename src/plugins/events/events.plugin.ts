import fp from 'fastify-plugin';
import { EventService } from '../../events/event.service';
import { registerEventListeners } from '../../events/event.registry';
import { requireDecorator } from '@/core/require-decorator';

declare module 'fastify' {
  interface FastifyInstance {
    /** Present when PLUGINS includes events. */
    event?: EventService;
  }
}

export default fp(async (app) => {
  const event = new EventService(requireDecorator(app, 'queue', 'events'));

  // Application listeners are declared in src/events/event.registry.ts.
  registerEventListeners(event);

  app.decorate('event', event);
  app.log.info('Event plugin registered');
}, { name: 'events', dependencies: ['queue'] });
