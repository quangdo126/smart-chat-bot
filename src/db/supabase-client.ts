/**
 * Supabase client with multi-tenant RLS support
 * Uses app.tenant_id session variable for row-level security
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js'

/**
 * Table row types matching schema.sql
 */
export interface TenantRow {
  id: string
  name: string
  shopify_store_url: string | null
  shopify_storefront_token: string | null
  shopify_admin_token: string | null
  system_prompt: string | null
  widget_config: Record<string, unknown>
  created_at: string
  updated_at: string
}

export interface ProductRow {
  id: string
  tenant_id: string
  shopify_product_id: string | null
  title: string
  description: string | null
  price: number | null
  currency: string
  image_url: string | null
  category: string | null
  tags: string[] | null
  embedding: number[] | null
  metadata: Record<string, unknown>
  synced_at: string | null
  created_at: string
}

export interface FaqRow {
  id: string
  tenant_id: string
  question: string
  answer: string
  category: string | null
  embedding: number[] | null
  created_at: string
}

export interface ConversationRow {
  id: string
  tenant_id: string
  session_id: string
  customer_email: string | null
  started_at: string
  last_message_at: string | null
  metadata: Record<string, unknown>
}

export interface MessageRow {
  id: string
  conversation_id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  tool_calls: Record<string, unknown> | null
  tokens_used: number | null
  created_at: string
}

/**
 * RPC function return types
 */
export interface ProductSearchResult {
  id: string
  shopify_product_id: string | null
  title: string
  description: string | null
  price: number | null
  currency: string
  image_url: string | null
  category: string | null
  tags: string[] | null
  metadata: Record<string, unknown>
  similarity: number
}

export interface FaqSearchResult {
  id: string
  question: string
  answer: string
  category: string | null
  similarity: number
}

/**
 * Creates a Supabase client with optional tenant context
 * @param url - Supabase project URL
 * @param key - Supabase service role key (bypasses RLS) or anon key (uses RLS)
 * @param tenantId - Optional tenant ID for RLS context
 */
export function createSupabaseClient(
  url: string,
  key: string,
  tenantId?: string
): SupabaseClient {
  const client = createClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
    global: {
      headers: tenantId
        ? { 'x-tenant-id': tenantId }
        : {},
    },
  })

  return client
}

/**
 * Sets the tenant context for RLS policies via session variable
 * Must be called before queries that depend on RLS tenant isolation
 * @param client - Supabase client instance
 * @param tenantId - Tenant identifier to set in session
 */
export async function setTenantContext(
  client: SupabaseClient,
  tenantId: string
): Promise<void> {
  const { error } = await client.rpc('set_tenant_context', {
    p_tenant_id: tenantId,
  })

  if (error) {
    throw new Error(`Failed to set tenant context: ${error.message}`)
  }
}

/**
 * Creates a tenant-scoped Supabase client
 * Automatically sets tenant context after creation
 */
export async function createTenantScopedClient(
  url: string,
  key: string,
  tenantId: string
): Promise<SupabaseClient> {
  const client = createSupabaseClient(url, key, tenantId)
  await setTenantContext(client, tenantId)
  return client
}

export type { SupabaseClient }
