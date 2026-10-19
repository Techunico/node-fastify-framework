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
    lazyConnect: true,
    connectTimeout: config.connectTimeoutMs,
    // Commands fail after a bounded number of retries instead of queuing
    // forever while Redis is unreachable.
    maxRetriesPerRequest: config.maxRetriesPerRequest,
    // Keep reconnecting in the background with capped backoff.
    retryStrategy: (attempt) => Math.min(attempt * 200, 5_000),
  });

  let lastErrorLog = 0;
  redis.on('error', (err) => {
    // Avoid flooding logs while reconnecting.
    if (Date.now() - lastErrorLog > 10_000) {
      lastErrorLog = Date.now();
      app.log.error({ err: { message: err.message, code: (err as NodeJS.ErrnoException).code } }, '❌ Redis error');
    }
  });
  redis.on('ready', () => app.log.info('✅ Redis connected'));

  // Fail startup clearly if Redis is not reachable.
  try {
    await redis.connect();
  } catch (err) {
    redis.disconnect();
    throw new Error(
      `Redis is not reachable at ${config.host}:${config.port} (${(err as Error).message}). ` +
        'Start Redis or remove "redis" from PLUGINS.',
    );
  }

  app.decorate('redis', redis);

  app.readiness.add('redis', async () => {
    const pong = await redis.ping();
    if (pong !== 'PONG') throw new Error('Unexpected ping response');
  });

  app.addHook('onClose', async () => {
    try {
      await redis.quit();
    } catch {
      redis.disconnect();
    }
  });
}, { name: 'redis' });
