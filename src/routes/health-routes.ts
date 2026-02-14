/**
 * Health check routes for Smart Chat Bot
 * GET /health - Basic health check
 * GET /health/ready - Readiness check with dependency verification
 */

import { Hono } from 'hono';
import type { Env, ContextVariables, ApiResponse } from '../types/index.js';

interface HealthStatus {
  status: 'healthy' | 'unhealthy';
  timestamp: string;
  version: string;
}

interface ReadinessStatus {
  status: 'ready' | 'not_ready';
  timestamp: string;
  checks: {
    kv: 'ok' | 'error';
    claudible: 'ok' | 'error' | 'not_configured';
  };
}

const healthRoutes = new Hono<{ Bindings: Env; Variables: ContextVariables }>();

/**
 * GET /health - Basic liveness check
 * Returns 200 if service is running
 */
healthRoutes.get('/', (c) => {
  const response: ApiResponse<HealthStatus> = {
    success: true,
    data: {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      version: '1.0.0',
    },
    timestamp: new Date().toISOString(),
  };
  return c.json(response);
});

/**
 * GET /health/ready - Readiness check
 * Verifies dependencies (KV, API keys) are available
 */
healthRoutes.get('/ready', async (c) => {
  const checks: ReadinessStatus['checks'] = {
    kv: 'error',
    claudible: 'not_configured',
  };

  // Check KV namespace availability
  try {
    if (c.env.CHAT_SESSIONS) {
      // Test KV with a simple operation
      await c.env.CHAT_SESSIONS.get('__health_check__');
      checks.kv = 'ok';
    }
  } catch {
    checks.kv = 'error';
  }

  // Check Claudible API key configuration
  if (c.env.CLAUDIBLE_API_KEY) {
    checks.claudible = 'ok';
  }

  // Determine overall readiness
  const isReady = checks.kv === 'ok' && checks.claudible === 'ok';

  const response: ApiResponse<ReadinessStatus> = {
    success: isReady,
    data: {
      status: isReady ? 'ready' : 'not_ready',
      timestamp: new Date().toISOString(),
      checks,
    },
    timestamp: new Date().toISOString(),
  };

  return c.json(response, isReady ? 200 : 503);
});

export { healthRoutes };
