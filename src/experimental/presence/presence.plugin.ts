import fp from 'fastify-plugin';
import { PresenceService } from './presence.service';
import { requireDecorator } from '@/core/require-decorator';

declare module 'fastify' {
  interface FastifyInstance {
    presence?: PresenceService;
  }
}

/** EXPERIMENTAL — not registered by the framework and not shipped in generated applications. */
export default fp(async (app) => {
  const presence = new PresenceService(requireDecorator(app, 'redis', 'presence'));

  app.decorate('presence', presence);
}, { name: 'presence', dependencies: ['redis'] });
