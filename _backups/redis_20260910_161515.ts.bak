import Redis from 'ioredis';

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

const globalForRedis = global as unknown as { redis: Redis };

// Optimized for Serverless/Local environments:
// Added connection timeout to prevent hangs when Redis is unavailable.
export const redis = globalForRedis.redis || new Redis(redisUrl, {
    connectTimeout: 5000, // 5s timeout
    maxRetriesPerRequest: 1, // Fail fast
    retryStrategy: (times) => {
        // Only retry 3 times then stop
        if (times > 3) return null;
        return Math.min(times * 200, 1000);
    },
    // Prevent unhandled error events
    reconnectOnError: (err) => {
        console.warn('[Redis] Reconnect on error:', err.message);
        return true;
    }
});

// Avoid "Too many listeners" warning
redis.setMaxListeners(20);

redis.on('error', (err) => {
    console.warn('[Redis] Connection Error:', err.message);
});

if (process.env.NODE_ENV !== 'production') globalForRedis.redis = redis;

export default redis;
