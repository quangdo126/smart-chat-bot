/**
 * Rate limiting middleware for Smart Chat Bot
 * Uses Cloudflare KV for distributed rate limiting
 */

import { Context, Next } from 'hono';
import type { Env, ApiResponse } from '../types/index.js';

/**
 * Rate limit configuration
 */
export interface RateLimitConfig {
  windowMs: number;      // Time window in milliseconds
  maxRequests: number;   // Max requests in window
  keyPrefix: string;     // KV key prefix
}

/**
 * Rate limit rules
 */
export const RATE_LIMIT_RULES = {
  perIp: {
    windowMs: 60 * 1000,           // 1 minute
    maxRequests: 30,
    keyPrefix: 'rate:ip:',
  },
  perSession: {
    windowMs: 60 * 60 * 1000,      // 1 hour
    maxRequests: 50,
    keyPrefix: 'rate:session:',
  },
  perTenant: {
    windowMs: 60 * 60 * 1000,      // 1 hour
    maxRequests: 500,
    keyPrefix: 'rate:tenant:',
  },
} as const;

/**
 * Rate limit entry stored in KV
 */
interface RateLimitEntry {
  count: number;
  resetAt: number;
}

/**
 * Get client IP from request
 */
export function getClientIP(c: Context): string {
  // Cloudflare Workers provides CF-Connecting-IP header
  const cfConnectingIP = c.req.header('CF-Connecting-IP');
  if (cfConnectingIP) return cfConnectingIP;

  // Fallback to X-Forwarded-For
  const forwardedFor = c.req.header('X-Forwarded-For');
  if (forwardedFor) {
    return forwardedFor.split(',')[0].trim();
  }

  // Fallback to X-Real-IP
  const realIP = c.req.header('X-Real-IP');
  if (realIP) return realIP;

  // Ultimate fallback
  return 'unknown-ip';
}

/**
 * Increment counter with TTL and return current count
 */
export async function incrementCounter(
  kv: KVNamespace,
  key: string,
  ttlSeconds: number
): Promise<{ count: number; resetAt: number }> {
  const now = Date.now();
  const resetAt = now + (ttlSeconds * 1000);

  // Get current entry
  const existing = await kv.get<RateLimitEntry>(key, 'json');

  if (existing && existing.resetAt > now) {
    // Existing entry still valid, increment
    const updated: RateLimitEntry = {
      count: existing.count + 1,
      resetAt: existing.resetAt,
    };
    await kv.put(key, JSON.stringify(updated), {
      expirationTtl: Math.ceil((existing.resetAt - now) / 1000),
    });
    return updated;
  }

  // No entry or expired, start fresh
  const newEntry: RateLimitEntry = {
    count: 1,
    resetAt,
  };
  await kv.put(key, JSON.stringify(newEntry), {
    expirationTtl: ttlSeconds,
  });
  return newEntry;
}

/**
 * Check rate limit for a specific key and config
 */
async function checkRateLimit(
  kv: KVNamespace,
  key: string,
  config: RateLimitConfig
): Promise<{ allowed: boolean; remaining: number; resetAt: number }> {
  const ttlSeconds = Math.ceil(config.windowMs / 1000);
  const { count, resetAt } = await incrementCounter(kv, key, ttlSeconds);

  return {
    allowed: count <= config.maxRequests,
    remaining: Math.max(0, config.maxRequests - count),
    resetAt,
  };
}

/**
 * Build 429 response with Retry-After header
 */
function buildRateLimitResponse(
  c: Context,
  resetAt: number,
  limitType: string
): Response {
  const now = Date.now();
  const retryAfterSeconds = Math.ceil((resetAt - now) / 1000);

  const response: ApiResponse<null> = {
    success: false,
    error: `Rate limit exceeded (${limitType}). Please try again later.`,
    timestamp: new Date().toISOString(),
  };

  return c.json(response, 429, {
    'Retry-After': retryAfterSeconds.toString(),
    'X-RateLimit-Reset': new Date(resetAt).toISOString(),
  });
}

/**
 * Rate limit middleware for chat routes
 * Applies IP, session, and tenant limits
 */
export async function rateLimitMiddleware(
  c: Context<{ Bindings: Env }>,
  next: Next
): Promise<Response | void> {
  const kv = c.env.RATE_LIMIT;

  // Graceful fallback if KV not configured
  if (!kv) {
    console.warn('[RateLimit] KV namespace not configured, skipping rate limiting');
    return next();
  }

  try {
    const clientIP = getClientIP(c);
    const tenantId = c.req.header('X-Tenant-ID') || 'unknown';
    const sessionId = c.req.header('X-Session-ID') || clientIP;

    // Check IP rate limit
    const ipKey = `${RATE_LIMIT_RULES.perIp.keyPrefix}${clientIP}`;
    const ipResult = await checkRateLimit(kv, ipKey, RATE_LIMIT_RULES.perIp);
    if (!ipResult.allowed) {
      console.log(`[RateLimit] IP limit exceeded: ${clientIP}`);
      return buildRateLimitResponse(c, ipResult.resetAt, 'IP');
    }

    // Check session rate limit
    const sessionKey = `${RATE_LIMIT_RULES.perSession.keyPrefix}${tenantId}:${sessionId}`;
    const sessionResult = await checkRateLimit(kv, sessionKey, RATE_LIMIT_RULES.perSession);
    if (!sessionResult.allowed) {
      console.log(`[RateLimit] Session limit exceeded: ${sessionId}`);
      return buildRateLimitResponse(c, sessionResult.resetAt, 'session');
    }

    // Check tenant rate limit
    const tenantKey = `${RATE_LIMIT_RULES.perTenant.keyPrefix}${tenantId}`;
    const tenantResult = await checkRateLimit(kv, tenantKey, RATE_LIMIT_RULES.perTenant);
    if (!tenantResult.allowed) {
      console.log(`[RateLimit] Tenant limit exceeded: ${tenantId}`);
      return buildRateLimitResponse(c, tenantResult.resetAt, 'tenant');
    }

    // Add rate limit headers to response
    c.header('X-RateLimit-Limit-IP', RATE_LIMIT_RULES.perIp.maxRequests.toString());
    c.header('X-RateLimit-Remaining-IP', ipResult.remaining.toString());

    return next();
  } catch (error) {
    // Log error but don't block request on rate limit failures
    console.error('[RateLimit] Error checking rate limit:', error);
    return next();
  }
}

/**
 * Apply rate limit middleware with custom config (for testing or special routes)
 */
export function createRateLimitMiddleware(
  kv: KVNamespace,
  config: RateLimitConfig
) {
  return async (c: Context, next: Next): Promise<Response | void> => {
    const clientIP = getClientIP(c);
    const key = `${config.keyPrefix}${clientIP}`;

    const result = await checkRateLimit(kv, key, config);
    if (!result.allowed) {
      return buildRateLimitResponse(c, result.resetAt, 'custom');
    }

    return next();
  };
}
