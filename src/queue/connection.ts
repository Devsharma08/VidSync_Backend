import { ConnectionOptions } from "bullmq";
import Redis from "ioredis";

/**
 * Common configuration options for the BullMQ connection to the Redis cache database.
 */
export const redisConnection: ConnectionOptions = {
   host: process.env.REDIS_HOST || '127.0.0.1',
   port: parseInt(process.env.REDIS_PORT || '6379', 10)
};

/**
 * Shared Redis client for general-purpose caching (summaries, sentiment, etc.).
 * Lazy-initialised singleton to avoid spawning multiple connections per service.
 */
let _redisCache: Redis | null = null;
export function getRedisCache(): Redis {
   if (!_redisCache) {
      _redisCache = new Redis({
         host: process.env.REDIS_HOST || '127.0.0.1',
         port: parseInt(process.env.REDIS_PORT || '6379', 10),
         lazyConnect: true,
      });
   }
   return _redisCache;
}