# Phase 4: Shopify Integration (Multi-tenant)

## Context Links
- [Plan Overview](plan.md)
- [Shopify Integration Report](../reports/researcher-260215-0128-shopify-integration.md)

## Overview
- **Priority:** P1 - Critical
- **Status:** pending
- **Effort:** 6h

Multi-tenant Shopify integration: each tenant has own Shopify store credentials stored in `tenants` table. Widget embeds on ANY website (Next.js, WordPress, etc), checkout redirects to tenant's Shopify store.

## Key Insights
- User's main website is Next.js (shows products)
- Checkout redirects to Shopify (per tenant config)
- Widget embeds via iframe on external site
- Each tenant has own Storefront API + Admin API tokens
- Storefront API: Public, rate-limited per buyer IP
- Admin API: Backend only, requires `write_draft_orders` scope

## External Site + Shopify Flow

```
[User's Next.js Site]
    ↓ displays products
[User browses & clicks chat]
    ↓ opens iframe widget
[Chat Widget (Cloudflare Pages)]
    ↓ API call with X-Tenant-ID
[Cloudflare Workers API]
    ↓ lookup tenant's Shopify credentials
[Shopify Storefront API] → Cart creation
    ↓ returns checkoutUrl
[Widget shows "Checkout" button]
    ↓ user clicks
[Redirect to Shopify Checkout]
    ↓ complete payment on Shopify
[Order confirmed]
```

## Requirements

### Functional
- Search products via Storefront API (per tenant)
- Create/update cart (per tenant's Shopify store)
- Create draft orders (Admin API, per tenant)
- Sync product catalog to RAG database (per tenant)
- Return checkoutUrl for redirect to Shopify

### Non-Functional
- Cart operations <500ms
- Handle Shopify rate limits gracefully
- Support multi-currency (per tenant config)

## Architecture

```
[Widget] → [Backend API]
              ├── X-Tenant-ID header
              ├── Lookup tenant config
              ├── Storefront API (products, cart, checkoutUrl)
              └── Admin API (draft orders)

[Webhook] → [Backend API] → [Supabase]
              ├── X-Shopify-Shop-Domain header
              └── Product sync (tenant-scoped)
```

## Related Code Files

### Create
- `src/services/shopify-storefront.ts` - Storefront API client (per tenant)
- `src/services/shopify-admin.ts` - Admin API client (per tenant)
- `src/services/shopify-factory.ts` - Factory to create clients from tenant config
- `src/routes/shopify.ts` - Shopify webhooks (multi-tenant)
- `src/routes/cart.ts` - Cart operations (multi-tenant)

## Implementation Steps

### 1. Shopify Factory Service (30min)
```typescript
// src/services/shopify-factory.ts
import { ShopifyStorefrontClient } from './shopify-storefront'
import { ShopifyAdminClient } from './shopify-admin'
import { TenantConfig } from './tenant'

export class ShopifyFactory {
  static createStorefrontClient(tenant: TenantConfig): ShopifyStorefrontClient | null {
    if (!tenant.shopifyStoreUrl || !tenant.shopifyStorefrontToken) {
      return null
    }
    return new ShopifyStorefrontClient({
      storeDomain: tenant.shopifyStoreUrl,
      storefrontToken: tenant.shopifyStorefrontToken
    })
  }

  static createAdminClient(tenant: TenantConfig): ShopifyAdminClient | null {
    if (!tenant.shopifyStoreUrl || !tenant.shopifyAdminToken) {
      return null
    }
    return new ShopifyAdminClient({
      storeDomain: tenant.shopifyStoreUrl,
      adminToken: tenant.shopifyAdminToken
    })
  }
}
```

### 2. Storefront API Client (1h)
```typescript
// src/services/shopify-storefront.ts
interface ShopifyStorefrontConfig {
  storeDomain: string
  storefrontToken: string
}

interface ProductEdge {
  node: {
    id: string
    title: string
    handle: string
    description: string
    featuredImage?: { url: string }
    variants: {
      edges: Array<{
        node: {
          id: string
          title: string
          price: { amount: string; currencyCode: string }
          availableForSale: boolean
        }
      }>
    }
  }
}

interface CartResponse {
  id: string
  checkoutUrl: string
  totalQuantity: number
  lines: {
    edges: Array<{
      node: {
        id: string
        quantity: number
        merchandise: {
          id: string
          title: string
        }
      }
    }>
  }
}

export class ShopifyStorefrontClient {
  private endpoint: string
  private token: string

  constructor(config: ShopifyStorefrontConfig) {
    this.endpoint = `https://${config.storeDomain}/api/2026-01/graphql.json`
    this.token = config.storefrontToken
  }

  private async query<T>(query: string, variables?: Record<string, unknown>): Promise<T> {
    const response = await fetch(this.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Storefront-Access-Token': this.token
      },
      body: JSON.stringify({ query, variables })
    })

    const json = await response.json()
    if (json.errors) {
      throw new Error(json.errors[0].message)
    }
    return json.data
  }

  async searchProducts(searchQuery: string, first = 10): Promise<ProductEdge[]> {
    const query = `
      query SearchProducts($query: String!, $first: Int!) {
        products(first: $first, query: $query) {
          edges {
            node {
              id
              title
              handle
              description
              featuredImage { url }
              variants(first: 5) {
                edges {
                  node {
                    id
                    title
                    price { amount currencyCode }
                    availableForSale
                  }
                }
              }
            }
          }
        }
      }
    `
    const data = await this.query<{ products: { edges: ProductEdge[] } }>(query, {
      query: searchQuery,
      first
    })
    return data.products.edges
  }

  async getProduct(handle: string): Promise<ProductEdge['node'] | null> {
    const query = `
      query GetProduct($handle: String!) {
        productByHandle(handle: $handle) {
          id
          title
          handle
          description
          featuredImage { url }
          variants(first: 10) {
            edges {
              node {
                id
                title
                price { amount currencyCode }
                availableForSale
              }
            }
          }
        }
      }
    `
    const data = await this.query<{ productByHandle: ProductEdge['node'] | null }>(query, {
      handle
    })
    return data.productByHandle
  }

  async createCart(
    variantId: string,
    quantity = 1,
    buyerEmail?: string
  ): Promise<CartResponse> {
    const query = `
      mutation CartCreate($input: CartInput!) {
        cartCreate(input: $input) {
          cart {
            id
            checkoutUrl
            totalQuantity
            lines(first: 10) {
              edges {
                node {
                  id
                  quantity
                  merchandise {
                    ... on ProductVariant {
                      id
                      title
                    }
                  }
                }
              }
            }
          }
          userErrors { field message }
        }
      }
    `
    const input: Record<string, unknown> = {
      lines: [{ merchandiseId: variantId, quantity }]
    }
    if (buyerEmail) {
      input.buyerIdentity = { email: buyerEmail }
    }

    const data = await this.query<{
      cartCreate: { cart: CartResponse; userErrors: Array<{ message: string }> }
    }>(query, { input })

    if (data.cartCreate.userErrors.length > 0) {
      throw new Error(data.cartCreate.userErrors[0].message)
    }
    return data.cartCreate.cart
  }

  async addToCart(cartId: string, variantId: string, quantity = 1): Promise<CartResponse> {
    const query = `
      mutation CartLinesAdd($cartId: ID!, $lines: [CartLineInput!]!) {
        cartLinesAdd(cartId: $cartId, lines: $lines) {
          cart {
            id
            checkoutUrl
            totalQuantity
            lines(first: 10) {
              edges {
                node {
                  id
                  quantity
                  merchandise {
                    ... on ProductVariant {
                      id
                      title
                    }
                  }
                }
              }
            }
          }
          userErrors { field message }
        }
      }
    `
    const data = await this.query<{
      cartLinesAdd: { cart: CartResponse; userErrors: Array<{ message: string }> }
    }>(query, {
      cartId,
      lines: [{ merchandiseId: variantId, quantity }]
    })

    if (data.cartLinesAdd.userErrors.length > 0) {
      throw new Error(data.cartLinesAdd.userErrors[0].message)
    }
    return data.cartLinesAdd.cart
  }
}
```

### 2. Admin API Client (1h)
```typescript
// src/services/shopify-admin.ts
interface ShopifyAdminConfig {
  storeDomain: string
  adminToken: string
}

interface DraftOrderLineItem {
  variantId?: string
  title?: string
  originalUnitPrice?: number
  quantity: number
}

interface DraftOrderResponse {
  id: string
  invoiceUrl: string
  status: string
  totalPrice: string
  lineItems: {
    edges: Array<{
      node: {
        title: string
        quantity: number
      }
    }>
  }
}

export class ShopifyAdminClient {
  private endpoint: string
  private token: string

  constructor(config: ShopifyAdminConfig) {
    this.endpoint = `https://${config.storeDomain}/admin/api/2026-01/graphql.json`
    this.token = config.adminToken
  }

  private async query<T>(query: string, variables?: Record<string, unknown>): Promise<T> {
    const response = await fetch(this.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': this.token
      },
      body: JSON.stringify({ query, variables })
    })

    const json = await response.json()
    if (json.errors) {
      throw new Error(json.errors[0].message)
    }
    return json.data
  }

  async createDraftOrder(options: {
    lineItems: DraftOrderLineItem[]
    customerId?: string
    email?: string
    note?: string
    discountPercent?: number
  }): Promise<DraftOrderResponse> {
    const query = `
      mutation DraftOrderCreate($input: DraftOrderInput!) {
        draftOrderCreate(input: $input) {
          draftOrder {
            id
            invoiceUrl
            status
            totalPriceSet { shopMoney { amount } }
            lineItems(first: 20) {
              edges {
                node {
                  title
                  quantity
                }
              }
            }
          }
          userErrors { field message }
        }
      }
    `

    const input: Record<string, unknown> = {
      lineItems: options.lineItems.map(item => {
        if (item.variantId) {
          return { variantId: item.variantId, quantity: item.quantity }
        }
        return {
          title: item.title,
          originalUnitPrice: item.originalUnitPrice,
          quantity: item.quantity
        }
      })
    }

    if (options.customerId) {
      input.customerId = options.customerId
    }
    if (options.email) {
      input.email = options.email
    }
    if (options.note) {
      input.note = options.note
    }
    if (options.discountPercent) {
      input.appliedDiscount = {
        valueType: 'PERCENTAGE',
        value: options.discountPercent
      }
    }

    const data = await this.query<{
      draftOrderCreate: {
        draftOrder: DraftOrderResponse & { totalPriceSet: { shopMoney: { amount: string } } }
        userErrors: Array<{ message: string }>
      }
    }>(query, { input })

    if (data.draftOrderCreate.userErrors.length > 0) {
      throw new Error(data.draftOrderCreate.userErrors[0].message)
    }

    return {
      ...data.draftOrderCreate.draftOrder,
      totalPrice: data.draftOrderCreate.draftOrder.totalPriceSet.shopMoney.amount
    }
  }

  async sendDraftOrderInvoice(draftOrderId: string, email: string): Promise<void> {
    const query = `
      mutation DraftOrderInvoiceSend($id: ID!, $email: EmailInput!) {
        draftOrderInvoiceSend(id: $id, email: $email) {
          draftOrder { id }
          userErrors { field message }
        }
      }
    `

    const data = await this.query<{
      draftOrderInvoiceSend: { userErrors: Array<{ message: string }> }
    }>(query, {
      id: draftOrderId,
      email: { to: email }
    })

    if (data.draftOrderInvoiceSend.userErrors.length > 0) {
      throw new Error(data.draftOrderInvoiceSend.userErrors[0].message)
    }
  }

  // Fetch all products for initial sync
  async fetchAllProducts(cursor?: string): Promise<{
    products: Array<{
      id: string
      title: string
      description: string
      handle: string
      productType: string
      tags: string[]
      featuredImage?: { url: string }
      variants: Array<{
        id: string
        price: string
        availableForSale: boolean
      }>
    }>
    hasNextPage: boolean
    endCursor: string | null
  }> {
    const query = `
      query FetchProducts($first: Int!, $after: String) {
        products(first: $first, after: $after) {
          edges {
            node {
              id
              title
              description
              handle
              productType
              tags
              featuredImage { url }
              variants(first: 1) {
                edges {
                  node {
                    id
                    price
                    availableForSale
                  }
                }
              }
            }
          }
          pageInfo {
            hasNextPage
            endCursor
          }
        }
      }
    `

    const data = await this.query<{
      products: {
        edges: Array<{
          node: {
            id: string
            title: string
            description: string
            handle: string
            productType: string
            tags: string[]
            featuredImage?: { url: string }
            variants: { edges: Array<{ node: { id: string; price: string; availableForSale: boolean } }> }
          }
        }>
        pageInfo: { hasNextPage: boolean; endCursor: string | null }
      }
    }>(query, { first: 50, after: cursor || null })

    return {
      products: data.products.edges.map(e => ({
        ...e.node,
        variants: e.node.variants.edges.map(v => v.node)
      })),
      hasNextPage: data.products.pageInfo.hasNextPage,
      endCursor: data.products.pageInfo.endCursor
    }
  }
}
```

### 3. Product Sync Endpoint (Multi-tenant) (45min)
```typescript
// src/routes/shopify.ts
import { Hono } from 'hono'
import { ShopifyFactory } from '../services/shopify-factory'
import { RAGService } from '../services/rag'
import { TenantService } from '../services/tenant'
import { createSupabaseClient } from '../db/client'
import { EmbeddingsService } from '../services/embeddings'
import type { Env } from '../config/env'

const shopifyRoutes = new Hono<{ Bindings: Env }>()

// Sync all products from Shopify to RAG database (tenant-scoped)
shopifyRoutes.post('/sync/products', async (c) => {
  const tenantId = c.req.header('X-Tenant-ID')
  if (!tenantId) {
    return c.json({ error: 'X-Tenant-ID required' }, 400)
  }

  const db = createSupabaseClient(c.env)
  const tenantService = new TenantService(db)
  const tenant = await tenantService.getConfig(tenantId)

  if (!tenant) {
    return c.json({ error: 'Tenant not found' }, 404)
  }

  const admin = ShopifyFactory.createAdminClient(tenant)
  if (!admin) {
    return c.json({ error: 'Shopify not configured for this tenant' }, 400)
  }

  const embeddings = new EmbeddingsService(c.env.OPENAI_API_KEY)
  const rag = new RAGService(db, embeddings, tenantId)

  let cursor: string | undefined
  let totalSynced = 0
  let totalErrors = 0

  do {
    const { products, hasNextPage, endCursor } = await admin.fetchAllProducts(cursor)

    const formatted = products.map(p => ({
      shopifyProductId: p.id.replace('gid://shopify/Product/', ''),
      title: p.title,
      description: p.description,
      price: parseFloat(p.variants[0]?.price || '0'),
      category: p.productType || undefined,
      tags: p.tags,
      imageUrl: p.featuredImage?.url,
      available: p.variants[0]?.availableForSale ?? false
    }))

    const { synced, errors } = await rag.syncProducts(formatted)
    totalSynced += synced
    totalErrors += errors

    cursor = hasNextPage ? (endCursor || undefined) : undefined
  } while (cursor)

  return c.json({
    success: true,
    tenantId,
    synced: totalSynced,
    errors: totalErrors
  })
})

// Webhook: Product created/updated (identify tenant by shop domain)
shopifyRoutes.post('/webhooks/products/update', async (c) => {
  const shopDomain = c.req.header('X-Shopify-Shop-Domain')
  if (!shopDomain) {
    return c.json({ error: 'Missing shop domain' }, 400)
  }

  // TODO: Verify webhook HMAC signature

  const db = createSupabaseClient(c.env)

  // Find tenant by Shopify store URL
  const { data: tenant } = await db
    .from('tenants')
    .select('id')
    .eq('shopify_store_url', shopDomain)
    .single()

  if (!tenant) {
    return c.json({ error: 'Tenant not found for shop' }, 404)
  }

  const product = await c.req.json()
  const embeddings = new EmbeddingsService(c.env.OPENAI_API_KEY)
  const rag = new RAGService(db, embeddings, tenant.id)

  await rag.upsertProduct({
    shopifyProductId: product.id.toString(),
    title: product.title,
    description: product.body_html?.replace(/<[^>]*>/g, '') || '',
    price: parseFloat(product.variants?.[0]?.price || '0'),
    category: product.product_type || undefined,
    tags: product.tags?.split(', ') || [],
    imageUrl: product.image?.src,
    available: product.variants?.[0]?.inventory_quantity > 0
  })

  return c.json({ received: true })
})

export { shopifyRoutes }
```

### 4. Cart Operations Route (Multi-tenant) (45min)
```typescript
// src/routes/cart.ts
import { Hono } from 'hono'
import { ShopifyFactory } from '../services/shopify-factory'
import { TenantService } from '../services/tenant'
import { createSupabaseClient } from '../db/client'
import type { Env } from '../config/env'

const cartRoutes = new Hono<{ Bindings: Env }>()

// Create cart or add to existing cart
cartRoutes.post('/cart/add', async (c) => {
  const tenantId = c.req.header('X-Tenant-ID')
  if (!tenantId) {
    return c.json({ error: 'X-Tenant-ID required' }, 400)
  }

  const body = await c.req.json<{
    variantId: string
    quantity?: number
    cartId?: string
  }>()

  if (!body.variantId) {
    return c.json({ error: 'variantId required' }, 400)
  }

  const db = createSupabaseClient(c.env)
  const tenantService = new TenantService(db)
  const tenant = await tenantService.getConfig(tenantId)

  if (!tenant) {
    return c.json({ error: 'Tenant not found' }, 404)
  }

  const storefront = ShopifyFactory.createStorefrontClient(tenant)
  if (!storefront) {
    return c.json({ error: 'Shopify not configured' }, 400)
  }

  try {
    let cart
    if (body.cartId) {
      cart = await storefront.addToCart(body.cartId, body.variantId, body.quantity || 1)
    } else {
      cart = await storefront.createCart(body.variantId, body.quantity || 1)
    }

    return c.json({
      success: true,
      cartId: cart.id,
      totalQuantity: cart.totalQuantity,
      checkoutUrl: cart.checkoutUrl  // <-- Redirect user to this URL
    })
  } catch (error) {
    return c.json({ error: (error as Error).message }, 500)
  }
})

// Get cart info
cartRoutes.get('/cart/:cartId', async (c) => {
  const tenantId = c.req.header('X-Tenant-ID')
  if (!tenantId) {
    return c.json({ error: 'X-Tenant-ID required' }, 400)
  }

  const cartId = c.req.param('cartId')

  const db = createSupabaseClient(c.env)
  const tenantService = new TenantService(db)
  const tenant = await tenantService.getConfig(tenantId)

  if (!tenant) {
    return c.json({ error: 'Tenant not found' }, 404)
  }

  const storefront = ShopifyFactory.createStorefrontClient(tenant)
  if (!storefront) {
    return c.json({ error: 'Shopify not configured' }, 400)
  }

  try {
    const cart = await storefront.getCart(cartId)
    return c.json({
      success: true,
      cart,
      checkoutUrl: cart.checkoutUrl
    })
  } catch (error) {
    return c.json({ error: (error as Error).message }, 500)
  }
})

export { cartRoutes }
```

### 5. Update Storefront Client with getCart (15min)
```typescript
// Add to src/services/shopify-storefront.ts

async getCart(cartId: string): Promise<CartResponse> {
  const query = `
    query GetCart($cartId: ID!) {
      cart(id: $cartId) {
        id
        checkoutUrl
        totalQuantity
        cost {
          totalAmount { amount currencyCode }
        }
        lines(first: 20) {
          edges {
            node {
              id
              quantity
              merchandise {
                ... on ProductVariant {
                  id
                  title
                  image { url }
                  price { amount currencyCode }
                  product { title }
                }
              }
            }
          }
        }
      }
    }
  `
  const data = await this.query<{ cart: CartResponse }>(query, { cartId })
  return data.cart
}
```

## Todo List
- [ ] Create `src/services/shopify-factory.ts`
- [ ] Create `src/services/shopify-storefront.ts` (unchanged, add getCart)
- [ ] Create `src/services/shopify-admin.ts` (unchanged)
- [ ] Create `src/routes/shopify.ts` with multi-tenant sync
- [ ] Create `src/routes/cart.ts` with multi-tenant cart ops
- [ ] Test product sync per tenant
- [ ] Test cart creation returns checkoutUrl
- [ ] Test checkout redirect to Shopify
- [ ] Test draft order creation

## Success Criteria
- Product sync populates only tenant's products in RAG
- Cart operations return valid checkoutUrl
- User can redirect to Shopify checkout from widget
- Draft orders created with correct tenant's Shopify store
- Webhooks identify tenant by shop domain

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Shopify rate limits | Medium | Medium | Implement exponential backoff |
| API version deprecation | Low | High | Use stable 2026-01 version |
| Webhook tenant mismatch | Medium | High | Validate shop domain against tenants table |
| Token exposure | Low | High | Store tokens in Supabase Vault |

## Security Considerations
- Never expose Admin API token to frontend
- Verify webhook signatures with per-tenant secrets
- Validate tenant ownership before API calls
- Use Storefront API for client-facing operations
- Store Shopify tokens encrypted

## Next Steps
-> [Phase 5: Chat Widget (Iframe)](phase-05-chat-widget.md)
