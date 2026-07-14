import rateLimit, { type RateLimitRequestHandler } from 'express-rate-limit';
import { RedisStore, type RedisReply } from 'rate-limit-redis';
import type Redis from 'ioredis';

/**
 * Per-IP rate limiter backed by Redis so limits are shared across replicas.
 * Per the HLD (§5.2/§6.2): 100 requests/min/IP on `/auth/*`.
 */
export function createAuthRateLimiter(redis: Redis): RateLimitRequestHandler {
  return rateLimit({
    windowMs: 60_000,
    limit: 100,
    standardHeaders: true,
    legacyHeaders: false,
    store: new RedisStore({
      sendCommand: (...args: string[]) =>
        redis.call(...(args as [string, ...string[]])) as Promise<RedisReply>,
      prefix: 'rl:auth:',
    }),
  });
}
