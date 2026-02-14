/**
 * Environment configuration with validation for multi-tenant setup
 */

import type { Env } from '../types/index.js';

/**
 * Validates required environment variables
 * @param env - Cloudflare Workers environment bindings
 * @throws Error if required variables are missing
 */
export function validateEnv(env: Env): void {
  const required: (keyof Env)[] = [
    'SUPABASE_URL',
    'SUPABASE_SERVICE_ROLE_KEY',
    'VOYAGE_API_KEY',
  ];

  const missing = required.filter((key) => !env[key]);

  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
}

/**
 * Gets environment with defaults
 */
export function getEnvConfig(env: Env) {
  return {
    environment: env.ENVIRONMENT || 'development',
    supabaseUrl: env.SUPABASE_URL,
    supabaseKey: env.SUPABASE_SERVICE_ROLE_KEY,
    voyageApiKey: env.VOYAGE_API_KEY,
    claudibleApiKey: env.CLAUDIBLE_API_KEY,
    isDevelopment: env.ENVIRONMENT === 'development',
    isProduction: env.ENVIRONMENT === 'production',
  };
}
