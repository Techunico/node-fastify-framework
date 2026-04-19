import redisPlugin from './redis.plugin';

export async function registerPlugins(app:any) {
  await app.register(redisPlugin);
}