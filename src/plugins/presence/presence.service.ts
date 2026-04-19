import { Redis } from 'ioredis';

export class PresenceService {
  constructor(private redis: Redis) {}

  async userConnected(userId: string, tenantId: string) {
    const userKey = `presence:user:${userId}`;
    const tenantKey = `presence:tenant:${tenantId}`;

    await this.redis.incr(userKey);
    await this.redis.sadd(tenantKey, userId);
  }

  async userDisconnected(userId: string, tenantId: string) {
    const userKey = `presence:user:${userId}`;
    const tenantKey = `presence:tenant:${tenantId}`;

    const count = await this.redis.decr(userKey);

    if (count <= 0) {
      await this.redis.del(userKey);
      await this.redis.srem(tenantKey, userId);

      // optional: last seen
      await this.redis.set(
        `presence:lastseen:${userId}`,
        Date.now()
      );
    }
  }

  async isOnline(userId: string): Promise<boolean> {
    const count = await this.redis.get(`presence:user:${userId}`);
    return Number(count) > 0;
  }

  async getOnlineUsers(tenantId: string): Promise<string[]> {
    return this.redis.smembers(`presence:tenant:${tenantId}`);
  }

  async getLastSeen(userId: string): Promise<number | null> {
    const val = await this.redis.get(`presence:lastseen:${userId}`);
    return val ? Number(val) : null;
  }
}