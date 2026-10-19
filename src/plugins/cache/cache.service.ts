import { Redis } from 'ioredis';

type CacheValue = any;

export class CacheService {
  constructor(private redis: Redis) {}

  private serialize(value: CacheValue): string {
    return JSON.stringify(value);
  }

  private deserialize<T>(value: string | null): T | null {
    if (!value) return null;
    return JSON.parse(value) as T;
  }

  async set(key: string, value: CacheValue, ttl?: number) {
    const data = this.serialize(value);

    if (ttl) {
      await this.redis.set(key, data, 'EX', ttl);
    } else {
      await this.redis.set(key, data);
    }
  }

  async get<T>(key: string): Promise<T | null> {
    const data = await this.redis.get(key);
    return this.deserialize<T>(data);
  }

  async del(key: string) {
    await this.redis.del(key);
  }

  async remember<T>(
    key: string,
    ttl: number,
    fn: () => Promise<T>
  ): Promise<T> {
    const cached = await this.get<T>(key);

    if (cached !== null) {
      return cached;
    }

    const fresh = await fn();
    await this.set(key, fresh, ttl);

    return fresh;
  }

  /**
   * Deletes keys matching `pattern` using incremental SCAN (non-blocking,
   * unlike KEYS). Returns the number of keys removed.
   */
  async flush(pattern: string, batchSize = 500): Promise<number> {
    let cursor = '0';
    let removed = 0;
    do {
      const [next, keys] = await this.redis.scan(cursor, 'MATCH', pattern, 'COUNT', batchSize);
      cursor = next;
      if (keys.length) {
        removed += await this.redis.unlink(...keys);
      }
    } while (cursor !== '0');
    return removed;
  }
}