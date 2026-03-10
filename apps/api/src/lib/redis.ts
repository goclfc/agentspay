import Redis from 'ioredis';

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

let redis: Redis | null = null;

export function getRedis(): Redis {
  if (!redis) {
    redis = new Redis(redisUrl, { maxRetriesPerRequest: 3, lazyConnect: true });
  }
  return redis;
}
