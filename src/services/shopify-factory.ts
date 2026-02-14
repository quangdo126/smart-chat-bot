/**
 * Shopify Client Factory for Multi-tenant Setup
 * Creates Storefront and Admin clients based on tenant configuration
 */

import type { TenantConfig } from '../types/index.js';
import { ShopifyStorefrontClient } from './shopify-storefront-client.js';
import { ShopifyAdminClient } from './shopify-admin-client.js';

export class ShopifyFactory {
  /**
   * Create Storefront API client for a tenant
   * Returns null if tenant doesn't have Shopify Storefront credentials
   */
  static createStorefrontClient(tenant: TenantConfig): ShopifyStorefrontClient | null {
    const credentials = tenant.shopifyCredentials;

    if (!credentials?.storeUrl || !credentials?.storefrontToken) {
      return null;
    }

    return new ShopifyStorefrontClient({
      storeUrl: credentials.storeUrl,
      storefrontToken: credentials.storefrontToken,
    });
  }

  /**
   * Create Admin API client for a tenant
   * Returns null if tenant doesn't have Shopify Admin credentials
   */
  static createAdminClient(tenant: TenantConfig): ShopifyAdminClient | null {
    const credentials = tenant.shopifyCredentials;

    if (!credentials?.storeUrl || !credentials?.adminToken) {
      return null;
    }

    return new ShopifyAdminClient({
      storeUrl: credentials.storeUrl,
      adminToken: credentials.adminToken,
    });
  }

  /**
   * Check if tenant has Storefront API configured
   */
  static hasStorefrontAccess(tenant: TenantConfig): boolean {
    const credentials = tenant.shopifyCredentials;
    return Boolean(credentials?.storeUrl && credentials?.storefrontToken);
  }

  /**
   * Check if tenant has Admin API configured
   */
  static hasAdminAccess(tenant: TenantConfig): boolean {
    const credentials = tenant.shopifyCredentials;
    return Boolean(credentials?.storeUrl && credentials?.adminToken);
  }

  /**
   * Create both clients for a tenant (convenience method)
   * Returns object with nullable clients
   */
  static createClients(tenant: TenantConfig): {
    storefront: ShopifyStorefrontClient | null;
    admin: ShopifyAdminClient | null;
  } {
    return {
      storefront: this.createStorefrontClient(tenant),
      admin: this.createAdminClient(tenant),
    };
  }
}

// Re-export types and classes for convenience
export { ShopifyStorefrontClient } from './shopify-storefront-client.js';
export { ShopifyAdminClient } from './shopify-admin-client.js';
export type {
  StorefrontConfig,
  ShopifyProduct,
  CartLine,
  CartResponse,
} from './shopify-storefront-client.js';
export type {
  AdminConfig,
  DraftOrderLine,
  DraftOrder,
  OrderStatus,
} from './shopify-admin-client.js';
