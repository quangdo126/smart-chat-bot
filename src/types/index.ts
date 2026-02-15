/**
 * TypeScript types for Smart Chat Bot
 */

/**
 * Cloudflare Workers environment bindings
 */
export interface Env {
  // KV namespaces
  CHAT_SESSIONS: KVNamespace;
  RATE_LIMIT?: KVNamespace;  // Optional, graceful fallback if not configured

  // Environment variables
  ENVIRONMENT: string;
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  VOYAGE_API_KEY: string;
  CLAUDIBLE_API_KEY?: string;
  // Cloudflare Turnstile secret key (optional - skip verification if not set)
  TURNSTILE_SECRET_KEY?: string;
}

/**
 * Chat message structure
 */
export interface ChatMessage {
  id: string;
  tenantId: string;
  sessionId: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
  metadata?: Record<string, unknown>;
}

/**
 * Shopify credentials for a tenant
 */
export interface ShopifyCredentials {
  storeUrl: string; // xxx.myshopify.com
  storefrontToken?: string; // Public Storefront API token
  adminToken?: string; // Admin API access token (backend only)
}

/**
 * Tenant configuration for multi-tenant setup
 */
export interface TenantConfig {
  id: string;
  name: string;
  shopifyDomain?: string;
  shopifyCredentials?: ShopifyCredentials;
  widgetSettings: WidgetSettings;
  ragConfig: RagConfig;
  createdAt: string;
  updatedAt: string;
}

/**
 * Widget customization settings
 */
export interface WidgetSettings {
  primaryColor: string;
  position: 'bottom-right' | 'bottom-left';
  greeting: string;
  placeholder: string;
  brandLogo?: string;
}

/**
 * RAG (Retrieval-Augmented Generation) configuration
 */
export interface RagConfig {
  enabled: boolean;
  collectionName: string;
  maxResults: number;
  similarityThreshold: number;
}

/**
 * Chat session data
 */
export interface ChatSession {
  id: string;
  tenantId: string;
  visitorId: string;
  messages: ChatMessage[];
  createdAt: string;
  lastActiveAt: string;
}

/**
 * API response wrapper
 */
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  timestamp: string;
}

/**
 * Hono context variables
 */
export interface ContextVariables {
  tenantId: string | null;
}
