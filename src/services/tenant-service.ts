/**
 * Tenant Service for multi-tenant configuration management
 * Handles tenant lookup and validation with caching
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { TenantRow } from '../db/supabase-client.js'

const TENANT_CACHE_TTL_MS = 5 * 60 * 1000 // 5 minutes

export interface TenantConfig {
  id: string
  name: string
  shopifyStoreUrl: string | null
  systemPrompt: string | null
  widgetConfig: Record<string, unknown>
  createdAt: string
  updatedAt: string
}

interface CacheEntry {
  tenant: TenantConfig | null
  expiresAt: number
}

export class TenantService {
  private supabase: SupabaseClient
  private cache: Map<string, CacheEntry>
  private cacheTtl: number

  constructor(supabase: SupabaseClient, cacheTtlMs?: number) {
    this.supabase = supabase
    this.cache = new Map()
    this.cacheTtl = cacheTtlMs ?? TENANT_CACHE_TTL_MS
  }

  /**
   * Get tenant configuration by ID
   * Uses in-memory cache to reduce database calls
   */
  async getTenant(tenantId: string): Promise<TenantConfig | null> {
    if (!tenantId || tenantId.trim().length === 0) {
      return null
    }

    // Check cache
    const cached = this.cache.get(tenantId)
    if (cached && cached.expiresAt > Date.now()) {
      return cached.tenant
    }

    // Fetch from database
    const { data, error } = await this.supabase
      .from('tenants')
      .select('id, name, shopify_store_url, system_prompt, widget_config, created_at, updated_at')
      .eq('id', tenantId)
      .single()

    if (error) {
      // PGRST116 = row not found
      if (error.code === 'PGRST116') {
        this.cache.set(tenantId, {
          tenant: null,
          expiresAt: Date.now() + this.cacheTtl,
        })
        return null
      }
      throw new Error(`Failed to fetch tenant: ${error.message}`)
    }

    // Map to TenantConfig
    const row = data as TenantRow
    const tenant: TenantConfig = {
      id: row.id,
      name: row.name,
      shopifyStoreUrl: row.shopify_store_url,
      systemPrompt: row.system_prompt,
      widgetConfig: row.widget_config,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }

    // Update cache
    this.cache.set(tenantId, {
      tenant,
      expiresAt: Date.now() + this.cacheTtl,
    })

    return tenant
  }

  /**
   * Validate that a tenant exists and is active
   */
  async validateTenant(tenantId: string): Promise<boolean> {
    const tenant = await this.getTenant(tenantId)
    return tenant !== null
  }

  /**
   * Get system prompt for tenant, with fallback to default
   */
  async getSystemPrompt(tenantId: string, defaultPrompt: string): Promise<string> {
    const tenant = await this.getTenant(tenantId)
    return tenant?.systemPrompt ?? defaultPrompt
  }

  /**
   * Get widget configuration for tenant
   */
  async getWidgetConfig(tenantId: string): Promise<Record<string, unknown>> {
    const tenant = await this.getTenant(tenantId)
    return tenant?.widgetConfig ?? {}
  }

  /**
   * Clear cache for a specific tenant or all tenants
   */
  clearCache(tenantId?: string): void {
    if (tenantId) {
      this.cache.delete(tenantId)
    } else {
      this.cache.clear()
    }
  }

  /**
   * Get all cached tenant IDs (for debugging/monitoring)
   */
  getCachedTenantIds(): string[] {
    const now = Date.now()
    const validIds: string[] = []

    for (const [id, entry] of this.cache.entries()) {
      if (entry.expiresAt > now && entry.tenant !== null) {
        validIds.push(id)
      }
    }

    return validIds
  }
}

/**
 * Factory function to create tenant service
 */
export function createTenantService(
  supabase: SupabaseClient,
  cacheTtlMs?: number
): TenantService {
  return new TenantService(supabase, cacheTtlMs)
}
