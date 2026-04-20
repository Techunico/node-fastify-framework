import { Redis } from 'ioredis';

export class RateLimitService {
  constructor(private redis: Redis) {}

  async hit(
    key: string,
    limit: number,
    windowSec: number
  ): Promise<{ allowed: boolean; remaining: number }> {
    const current = await this.redis.incr(key);

    if (current === 1) {
      await this.redis.expire(key, windowSec);
    }

    const remaining = Math.max(limit - current, 0);

    return {
      allowed: current <= limit,
      remaining,
    };
  }
}