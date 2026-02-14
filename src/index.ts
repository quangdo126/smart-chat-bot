/**
 * Smart Chat Bot - Main entry point
 * Hono app with CORS, logging, and tenant middleware
 */

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import type { Env, ContextVariables, ApiResponse } from './types/index.js';
import { chatRoutes } from './routes/chat-routes.js';
import { healthRoutes } from './routes/health-routes.js';

// Create Hono app with typed environment and context variables
const app = new Hono<{ Bindings: Env; Variables: ContextVariables }>();

// CORS middleware - allow all origins for universal widget embedding
app.use(
  '*',
  cors({
    origin: '*',
    allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization', 'X-Tenant-ID'],
    exposeHeaders: ['Content-Length'],
    maxAge: 86400,
    credentials: false,
  })
);

// Logger middleware
app.use('*', logger());

// Tenant ID extraction middleware
app.use('*', async (c, next) => {
  const tenantId = c.req.header('X-Tenant-ID') || null;
  c.set('tenantId', tenantId);
  await next();
});

// Tenant validation middleware for API routes
// Returns 400 if X-Tenant-ID header is missing
app.use('/api/*', async (c, next) => {
  const tenantId = c.get('tenantId');
  if (!tenantId) {
    const response: ApiResponse<null> = {
      success: false,
      error: 'X-Tenant-ID header is required',
      timestamp: new Date().toISOString(),
    };
    return c.json(response, 400);
  }
  await next();
});

// Mount routes
app.route('/api/chat', chatRoutes);
app.route('/health', healthRoutes);

// Root endpoint
app.get('/', (c) => {
  const response: ApiResponse<{ name: string; version: string }> = {
    success: true,
    data: {
      name: 'Smart Chat Bot API',
      version: '1.0.0',
    },
    timestamp: new Date().toISOString(),
  };
  return c.json(response);
});

// 404 handler
app.notFound((c) => {
  const response: ApiResponse<null> = {
    success: false,
    error: 'Not Found',
    timestamp: new Date().toISOString(),
  };
  return c.json(response, 404);
});

// Error handler
app.onError((err, c) => {
  console.error('Unhandled error:', err);
  const response: ApiResponse<null> = {
    success: false,
    error: c.env.ENVIRONMENT === 'development' ? err.message : 'Internal Server Error',
    timestamp: new Date().toISOString(),
  };
  return c.json(response, 500);
});

export default app;
