import fp from 'fastify-plugin';
import { PresenceService } from './presence.service';

declare module 'fastify' {
  interface FastifyInstance {
    presence: PresenceService;
  }
}

export default fp(async (app) => {
  const presence = new PresenceService(app.redis);

  app.decorate('presence', presence);
});