/**
 * Anti-spam middleware for Smart Chat Bot
 * Detects and prevents spam/abuse patterns
 */

import { Context, Next } from 'hono';
import type { Env, ApiResponse } from '../types/index.js';
import { getClientIP } from './rate-limit.js';

/**
 * Anti-spam configuration
 */
const ANTI_SPAM_CONFIG = {
  // Same message repeated 3+ times in 5 minutes
  duplicateMessageWindow: 5 * 60 * 1000,  // 5 minutes
  duplicateMessageLimit: 3,

  // Messages sent too fast (< 1 second apart)
  minMessageIntervalMs: 1000,  // 1 second

  // Session with too many messages
  sessionMessageLimit: 100,
  sessionMessageWindow: 60 * 60 * 1000,  // 1 hour
} as const;

/**
 * KV key prefixes for anti-spam tracking
 */
const KEY_PREFIXES = {
  messageHash: 'spam:hash:',
  lastMessage: 'spam:last:',
  sessionCount: 'spam:session:',
  flaggedSession: 'spam:flagged:',
} as const;

/**
 * Hash message content for comparison (simple djb2 hash)
 */
export function hashContent(content: string): string {
  let hash = 5381;
  for (let i = 0; i < content.length; i++) {
    hash = ((hash << 5) + hash) + content.charCodeAt(i);
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash).toString(36);
}

/**
 * Track message hash and check for duplicates
 */
async function checkDuplicateMessage(
  kv: KVNamespace,
  sessionId: string,
  messageHash: string
): Promise<{ isDuplicate: boolean; count: number }> {
  const key = `${KEY_PREFIXES.messageHash}${sessionId}:${messageHash}`;
  const ttlSeconds = Math.ceil(ANTI_SPAM_CONFIG.duplicateMessageWindow / 1000);

  const existing = await kv.get<number>(key, 'json');
  const count = (existing || 0) + 1;

  await kv.put(key, JSON.stringify(count), {
    expirationTtl: ttlSeconds,
  });

  return {
    isDuplicate: count >= ANTI_SPAM_CONFIG.duplicateMessageLimit,
    count,
  };
}

/**
 * Check if messages are being sent too fast
 */
async function checkMessageSpeed(
  kv: KVNamespace,
  sessionId: string
): Promise<{ tooFast: boolean; intervalMs: number }> {
  const key = `${KEY_PREFIXES.lastMessage}${sessionId}`;
  const now = Date.now();

  const lastTimestamp = await kv.get<number>(key, 'json');

  // Update last message timestamp
  await kv.put(key, JSON.stringify(now), {
    expirationTtl: 300, // 5 minutes
  });

  if (!lastTimestamp) {
    return { tooFast: false, intervalMs: 0 };
  }

  const intervalMs = now - lastTimestamp;
  return {
    tooFast: intervalMs < ANTI_SPAM_CONFIG.minMessageIntervalMs,
    intervalMs,
  };
}

/**
 * Track session message count and check for excessive usage
 */
async function checkSessionMessageCount(
  kv: KVNamespace,
  sessionId: string
): Promise<{ exceeded: boolean; count: number; flagged: boolean }> {
  const countKey = `${KEY_PREFIXES.sessionCount}${sessionId}`;
  const flagKey = `${KEY_PREFIXES.flaggedSession}${sessionId}`;
  const ttlSeconds = Math.ceil(ANTI_SPAM_CONFIG.sessionMessageWindow / 1000);

  // Get current count
  const existing = await kv.get<number>(countKey, 'json');
  const count = (existing || 0) + 1;

  // Update count
  await kv.put(countKey, JSON.stringify(count), {
    expirationTtl: ttlSeconds,
  });

  const exceeded = count >= ANTI_SPAM_CONFIG.sessionMessageLimit;

  // Flag session for review if limit exceeded
  if (exceeded) {
    const isAlreadyFlagged = await kv.get(flagKey);
    if (!isAlreadyFlagged) {
      await kv.put(flagKey, JSON.stringify({
        sessionId,
        flaggedAt: new Date().toISOString(),
        messageCount: count,
      }), {
        expirationTtl: 24 * 60 * 60, // 24 hours
      });
      console.log(`[AntiSpam] Session flagged for review: ${sessionId}`);
    }
  }

  return {
    exceeded,
    count,
    flagged: exceeded,
  };
}

/**
 * Build spam detection response
 */
function buildSpamResponse(
  c: Context,
  reason: string,
  retryAfterSeconds: number = 5
): Response {
  const response: ApiResponse<null> = {
    success: false,
    error: reason,
    timestamp: new Date().toISOString(),
  };

  return c.json(response, 429, {
    'Retry-After': retryAfterSeconds.toString(),
    'X-Spam-Detected': 'true',
  });
}

/**
 * Extract message content from request body
 */
async function getMessageContent(c: Context): Promise<string | null> {
  try {
    const body = await c.req.json();
    const messages = body.messages;
    if (Array.isArray(messages) && messages.length > 0) {
      const lastMessage = messages[messages.length - 1];
      if (lastMessage && typeof lastMessage.content === 'string') {
        return lastMessage.content.trim();
      }
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Anti-spam middleware for chat routes
 */
export async function antiSpamMiddleware(
  c: Context<{ Bindings: Env }>,
  next: Next
): Promise<Response | void> {
  const kv = c.env.RATE_LIMIT;

  // Graceful fallback if KV not configured
  if (!kv) {
    console.warn('[AntiSpam] KV namespace not configured, skipping anti-spam checks');
    return next();
  }

  try {
    const clientIP = getClientIP(c);
    const tenantId = c.req.header('X-Tenant-ID') || 'unknown';
    const sessionId = c.req.header('X-Session-ID') || clientIP;
    const uniqueSessionId = `${tenantId}:${sessionId}`;

    // Check message speed first (no body parsing needed)
    const speedResult = await checkMessageSpeed(kv, uniqueSessionId);
    if (speedResult.tooFast) {
      console.log(`[AntiSpam] Messages too fast: ${uniqueSessionId}, interval: ${speedResult.intervalMs}ms`);
      // Warning only, don't block - just slow down response
      c.header('X-Spam-Warning', 'slow-down');
    }

    // Check session message count
    const sessionResult = await checkSessionMessageCount(kv, uniqueSessionId);
    if (sessionResult.exceeded) {
      console.log(`[AntiSpam] Session message limit exceeded: ${uniqueSessionId}, count: ${sessionResult.count}`);
      return buildSpamResponse(
        c,
        'Message limit exceeded for this session. Please try again later.',
        60
      );
    }

    // Clone request to read body without consuming it
    const clonedRequest = c.req.raw.clone();
    const messageContent = await getMessageContentFromRequest(clonedRequest);

    if (messageContent) {
      const msgHash = hashContent(messageContent);
      const duplicateResult = await checkDuplicateMessage(kv, uniqueSessionId, msgHash);

      if (duplicateResult.isDuplicate) {
        console.log(`[AntiSpam] Duplicate message detected: ${uniqueSessionId}, count: ${duplicateResult.count}`);
        return buildSpamResponse(
          c,
          'Duplicate message detected. Please send a different message.',
          10
        );
      }
    }

    return next();
  } catch (error) {
    // Log error but don't block request on anti-spam failures
    console.error('[AntiSpam] Error checking anti-spam:', error);
    return next();
  }
}

/**
 * Helper to extract message content from cloned request
 */
async function getMessageContentFromRequest(request: Request): Promise<string | null> {
  try {
    const body = await request.json() as { messages?: Array<{ content?: string }> };
    const messages = body.messages;
    if (Array.isArray(messages) && messages.length > 0) {
      const lastMessage = messages[messages.length - 1];
      if (lastMessage && typeof lastMessage.content === 'string') {
        return lastMessage.content.trim();
      }
    }
    return null;
  } catch {
    return null;
  }
}
