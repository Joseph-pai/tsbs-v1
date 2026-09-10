import Redis from 'ioredis';

const hasRedisUrl = !!process.env.REDIS_URL;

// Mock Redis client when REDIS_URL is not configured (e.g. Netlify serverless without Redis)
// This prevents 5-second socket connection timeouts on every API invocation.
const dummyRedis = {
    get: async () => null,
    set: async () => 'OK',
    del: async () => 0,
    on: () => dummyRedis,
    setMaxListeners: () => dummyRedis,
} as unknown as Redis;

const globalForRedis = global as unknown as { redis: Redis };

export const redis = hasRedisUrl
    ? (globalForRedis.redis || new Redis(process.env.REDIS_URL!, {
        connectTimeout: 2000,
        maxRetriesPerRequest: 1,
        enableOfflineQueue: false,
        retryStrategy: (times) => (times > 2 ? null : 200),
    }))
    : dummyRedis;

if (hasRedisUrl && process.env.NODE_ENV !== 'production') {
    globalForRedis.redis = redis;
}

export default redis;
