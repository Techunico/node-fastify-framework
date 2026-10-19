import fp from 'fastify-plugin';
import Redis from 'ioredis';
import { FastifyInstance } from 'fastify';
import { loadRedisConfig, RedisPluginConfig } from './config';

declare module 'fastify' {
  interface FastifyInstance {
    /** Present when PLUGINS includes redis. */
    redis?: Redis;
  }
}

export interface RedisPluginOptions {
  config?: RedisPluginConfig;
}

/** Used by the plugin registry to validate REDIS_* only when the plugin is enabled. */
export const loadConfig = loadRedisConfig;

export default fp(async (app: FastifyInstance, options: RedisPluginOptions) => {
  const config = options.config ?? loadRedisConfig(app.config.source);

  const redis = new Redis({
    host: config.host,
    port: config.port,
    password: config.password,
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
