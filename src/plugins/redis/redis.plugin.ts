import fp from 'fastify-plugin';
import Redis from 'ioredis';
import { FastifyInstance } from 'fastify';
import { config } from "@/config";

declare module 'fastify' {
  interface FastifyInstance {
    /** Present when PLUGINS includes redis. */
    redis?: Redis;
  }
}

export default fp(async (app: FastifyInstance) => {
  const redis = new Redis({
    host: config.redis.host,
    port: config.redis.port,
    password: config.redis.password,
  });

  redis.on('connect', () => {
    app.log.info('✅ Redis connected');
  });

  redis.on('error', (err) => {
    app.log.error({ err }, '❌ Redis error');
  });

  app.decorate('redis', redis);

  app.readiness.add('redis', async () => {
    const pong = await redis.ping();
    if (pong !== 'PONG') throw new Error('Unexpected ping response');
  });

  app.addHook('onClose', async () => {
    await redis.quit();
  });
}, { name: 'redis' });
