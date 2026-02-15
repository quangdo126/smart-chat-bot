/**
 * Cloudflare Turnstile verification middleware
 * Verifies invisible CAPTCHA tokens to protect against bots
 */

import type { Context, Next } from 'hono'
import type { Env, ContextVariables } from '../types/index.js'

const TURNSTILE_VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify'

// Cache for verified tokens (key: token hash, value: timestamp)
// Tokens are cached for 5 minutes to reduce API calls
const verifiedTokens = new Map<string, number>()
const CACHE_TTL_MS = 5 * 60 * 1000 // 5 minutes

/**
 * Response from Turnstile verification API
 */
export interface TurnstileVerifyResponse {
  success: boolean
  'error-codes'?: string[]
  challenge_ts?: string
  hostname?: string
  action?: string
  cdata?: string
}

/**
 * Generate a simple hash for caching token verification results
 */
function hashToken(token: string): string {
  let hash = 0
  for (let i = 0; i < token.length; i++) {
    const char = token.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash = hash & hash // Convert to 32-bit integer
  }
  return hash.toString(36)
}

/**
 * Clean expired entries from the verification cache
 */
function cleanExpiredCache(): void {
  const now = Date.now()
  for (const [key, timestamp] of verifiedTokens.entries()) {
    if (now - timestamp > CACHE_TTL_MS) {
      verifiedTokens.delete(key)
    }
  }
}

/**
 * Verify a Turnstile token with Cloudflare API
 * @param token - The Turnstile response token from client
 * @param secretKey - Your Turnstile secret key
 * @param ip - Optional client IP address for additional verification
 * @returns true if verification succeeds, false otherwise
 */
export async function verifyTurnstile(
  token: string,
  secretKey: string,
  ip?: string
): Promise<boolean> {
  if (!token || !secretKey) {
    return false
  }

  // Check cache first
  const tokenHash = hashToken(token)
  const cachedTimestamp = verifiedTokens.get(tokenHash)
  if (cachedTimestamp && Date.now() - cachedTimestamp < CACHE_TTL_MS) {
    return true
  }

  try {
    const formData = new URLSearchParams()
    formData.append('secret', secretKey)
    formData.append('response', token)
    if (ip) {
      formData.append('remoteip', ip)
    }

    const response = await fetch(TURNSTILE_VERIFY_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: formData.toString(),
    })

    if (!response.ok) {
      console.error('Turnstile API error:', response.status, response.statusText)
      return false
    }

    const result: TurnstileVerifyResponse = await response.json()

    if (result.success) {
      // Cache successful verification
      verifiedTokens.set(tokenHash, Date.now())
      // Clean expired entries periodically
      if (verifiedTokens.size > 100) {
        cleanExpiredCache()
      }
    } else {
      console.warn('Turnstile verification failed:', result['error-codes'])
    }

    return result.success
  } catch (error) {
    console.error('Turnstile verification error:', error)
    return false
  }
}

/**
 * Hono middleware for Turnstile verification
 * - Extracts token from X-Turnstile-Token header
 * - Skips verification if TURNSTILE_SECRET_KEY is not configured (optional feature)
 * - Returns 403 if token is invalid when Turnstile is enabled
 */
export async function turnstileMiddleware(
  c: Context<{ Bindings: Env; Variables: ContextVariables }>,
  next: Next
): Promise<Response | void> {
  const secretKey = c.env.TURNSTILE_SECRET_KEY

  // If Turnstile is not configured, skip verification (feature is optional)
  if (!secretKey) {
    return next()
  }

  const token = c.req.header('X-Turnstile-Token')

  // If no token provided, reject the request
  if (!token) {
    return c.json(
      {
        success: false,
        error: 'CAPTCHA verification required',
        timestamp: new Date().toISOString(),
      },
      403
    )
  }

  // Get client IP from Cloudflare headers
  const clientIp = c.req.header('CF-Connecting-IP') || c.req.header('X-Forwarded-For')

  // Verify the token
  const isValid = await verifyTurnstile(token, secretKey, clientIp)

  if (!isValid) {
    return c.json(
      {
        success: false,
        error: 'CAPTCHA verification failed',
        timestamp: new Date().toISOString(),
      },
      403
    )
  }

  return next()
}
