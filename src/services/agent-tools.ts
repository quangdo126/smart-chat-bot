/**
 * Agent Tools for AI Sales Chatbot
 * Defines Claude tool_use schema and tool execution logic
 */

import type { RagService } from './rag-service.js'
import type { TenantService } from './tenant-service.js'
import { ShopifyFactory, type CartResponse, type ShopifyProduct } from './shopify-factory.js'

/**
 * Agent execution context with tenant and session info
 */
export interface AgentContext {
  tenantId: string
  sessionId: string
  cartId?: string
}

/**
 * Claude tool_use schema definition
 */
export interface ToolDefinition {
  name: string
  description: string
  input_schema: {
    type: 'object'
    properties: Record<string, { type: string; description: string }>
    required?: string[]
  }
}

/**
 * Tool execution result
 */
export interface ToolResult {
  success: boolean
  data?: unknown
  error?: string
}

/**
 * All available tools for the sales agent
 */
export const AGENT_TOOLS: ToolDefinition[] = [
  {
    name: 'search_products',
    description: 'Search for products in the store by keywords or description',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query for finding products' },
        limit: { type: 'number', description: 'Maximum number of results (default 5)' },
      },
      required: ['query'],
    },
  },
  {
    name: 'get_product_details',
    description: 'Get detailed information about a specific product by its handle/slug',
    input_schema: {
      type: 'object',
      properties: {
        productHandle: { type: 'string', description: 'Product handle (URL slug)' },
      },
      required: ['productHandle'],
    },
  },
  {
    name: 'add_to_cart',
    description: 'Add a product variant to the shopping cart',
    input_schema: {
      type: 'object',
      properties: {
        variantId: { type: 'string', description: 'Product variant ID to add' },
        quantity: { type: 'number', description: 'Quantity to add (default 1)' },
      },
      required: ['variantId'],
    },
  },
  {
    name: 'get_cart',
    description: 'Get current shopping cart contents and checkout URL',
    input_schema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'search_faqs',
    description: 'Search FAQ/help articles for customer questions about shipping, returns, policies',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Question or topic to search' },
      },
      required: ['query'],
    },
  },
  {
    name: 'create_order',
    description: 'Create a draft order for the customer (requires customer email)',
    input_schema: {
      type: 'object',
      properties: {
        email: { type: 'string', description: 'Customer email address' },
        note: { type: 'string', description: 'Optional note for the order' },
      },
      required: ['email'],
    },
  },
]

/**
 * Format product for display in chat
 */
function formatProduct(product: ShopifyProduct): Record<string, unknown> {
  const availableVariants = product.variants.filter((v) => v.available)
  return {
    title: product.title,
    handle: product.handle,
    description: product.description?.slice(0, 200) || 'No description',
    price: `$${product.priceRange.minPrice.toFixed(2)}`,
    priceRange:
      product.priceRange.minPrice !== product.priceRange.maxPrice
        ? `$${product.priceRange.minPrice.toFixed(2)} - $${product.priceRange.maxPrice.toFixed(2)}`
        : null,
    image: product.images[0]?.url || null,
    variants: availableVariants.map((v) => ({
      id: v.id,
      title: v.title,
      price: `$${v.price.toFixed(2)}`,
    })),
    inStock: availableVariants.length > 0,
  }
}

/**
 * Format cart response for display
 */
function formatCart(cart: CartResponse): Record<string, unknown> {
  return {
    cartId: cart.cartId,
    checkoutUrl: cart.checkoutUrl,
    itemCount: cart.lines.length,
    items: cart.lines.map((line) => ({
      variantId: line.merchandiseId,
      quantity: line.quantity,
    })),
  }
}

/**
 * Tool executor class - handles execution of all agent tools
 */
export class ToolExecutor {
  private rag: RagService
  private tenantService: TenantService
  private shopifyFactory: typeof ShopifyFactory

  // In-memory cart storage (per session)
  private cartStore: Map<string, string> = new Map()

  constructor(
    rag: RagService,
    tenantService: TenantService,
    shopifyFactory: typeof ShopifyFactory
  ) {
    this.rag = rag
    this.tenantService = tenantService
    this.shopifyFactory = shopifyFactory
  }

  /**
   * Get cart ID for session, with fallback to context
   */
  private getCartId(context: AgentContext): string | undefined {
    const sessionKey = `${context.tenantId}:${context.sessionId}`
    return this.cartStore.get(sessionKey) || context.cartId
  }

  /**
   * Store cart ID for session
   */
  private setCartId(context: AgentContext, cartId: string): void {
    const sessionKey = `${context.tenantId}:${context.sessionId}`
    this.cartStore.set(sessionKey, cartId)
  }

  /**
   * Execute a tool by name with given input
   */
  async execute(
    toolName: string,
    input: Record<string, unknown>,
    context: AgentContext
  ): Promise<ToolResult> {
    try {
      switch (toolName) {
        case 'search_products':
          return await this.searchProducts(input, context)
        case 'get_product_details':
          return await this.getProductDetails(input, context)
        case 'add_to_cart':
          return await this.addToCart(input, context)
        case 'get_cart':
          return await this.getCart(context)
        case 'search_faqs':
          return await this.searchFaqs(input, context)
        case 'create_order':
          return await this.createOrder(input, context)
        default:
          return { success: false, error: `Unknown tool: ${toolName}` }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Tool execution failed'
      return { success: false, error: message }
    }
  }

  /**
   * Search products using RAG service
   */
  private async searchProducts(
    input: Record<string, unknown>,
    context: AgentContext
  ): Promise<ToolResult> {
    const query = input.query as string
    const limit = (input.limit as number) || 5

    if (!query || query.trim().length === 0) {
      return { success: false, error: 'Search query is required' }
    }

    // Try RAG search first
    const ragResults = await this.rag.searchProducts(context.tenantId, query, limit)

    if (ragResults.length > 0) {
      return {
        success: true,
        data: {
          source: 'database',
          products: ragResults.map((p) => ({
            id: p.id,
            title: p.title,
            description: p.description?.slice(0, 200) || 'No description',
            price: p.price ? `$${p.price.toFixed(2)} ${p.currency}` : 'Price not available',
            image: p.imageUrl,
            category: p.category,
          })),
        },
      }
    }

    // Fallback to Shopify Storefront API
    const tenant = await this.tenantService.getTenant(context.tenantId)
    if (!tenant) {
      return { success: false, error: 'Tenant not found' }
    }

    const storefront = this.shopifyFactory.createStorefrontClient(tenant as any)
    if (!storefront) {
      return { success: true, data: { products: [], message: 'No products found' } }
    }

    const products = await storefront.searchProducts(query, limit)
    return {
      success: true,
      data: {
        source: 'shopify',
        products: products.map(formatProduct),
      },
    }
  }

  /**
   * Get detailed product info by handle
   */
  private async getProductDetails(
    input: Record<string, unknown>,
    context: AgentContext
  ): Promise<ToolResult> {
    const productHandle = input.productHandle as string

    if (!productHandle) {
      return { success: false, error: 'Product handle is required' }
    }

    const tenant = await this.tenantService.getTenant(context.tenantId)
    if (!tenant) {
      return { success: false, error: 'Tenant not found' }
    }

    const storefront = this.shopifyFactory.createStorefrontClient(tenant as any)
    if (!storefront) {
      return { success: false, error: 'Shopify not configured for this store' }
    }

    const product = await storefront.getProduct(productHandle)
    if (!product) {
      return { success: false, error: `Product not found: ${productHandle}` }
    }

    return { success: true, data: formatProduct(product) }
  }

  /**
   * Add item to cart (creates cart if needed)
   */
  private async addToCart(
    input: Record<string, unknown>,
    context: AgentContext
  ): Promise<ToolResult> {
    const variantId = input.variantId as string
    const quantity = (input.quantity as number) || 1

    if (!variantId) {
      return { success: false, error: 'Variant ID is required' }
    }

    const tenant = await this.tenantService.getTenant(context.tenantId)
    if (!tenant) {
      return { success: false, error: 'Tenant not found' }
    }

    const storefront = this.shopifyFactory.createStorefrontClient(tenant as any)
    if (!storefront) {
      return { success: false, error: 'Shopify not configured for this store' }
    }

    const existingCartId = this.getCartId(context)
    let cart: CartResponse

    if (existingCartId) {
      // Add to existing cart
      cart = await storefront.addToCart(existingCartId, [
        { merchandiseId: variantId, quantity },
      ])
    } else {
      // Create new cart
      cart = await storefront.createCart([{ merchandiseId: variantId, quantity }])
      this.setCartId(context, cart.cartId)
    }

    return {
      success: true,
      data: {
        ...formatCart(cart),
        message: `Added ${quantity} item(s) to cart`,
      },
    }
  }

  /**
   * Get current cart contents
   */
  private async getCart(context: AgentContext): Promise<ToolResult> {
    const cartId = this.getCartId(context)

    if (!cartId) {
      return {
        success: true,
        data: { items: [], message: 'Cart is empty' },
      }
    }

    const tenant = await this.tenantService.getTenant(context.tenantId)
    if (!tenant) {
      return { success: false, error: 'Tenant not found' }
    }

    const storefront = this.shopifyFactory.createStorefrontClient(tenant as any)
    if (!storefront) {
      return { success: false, error: 'Shopify not configured' }
    }

    try {
      const cart = await storefront.getCart(cartId)
      return { success: true, data: formatCart(cart) }
    } catch {
      // Cart might have expired
      return { success: true, data: { items: [], message: 'Cart is empty or expired' } }
    }
  }

  /**
   * Search FAQs using RAG service
   */
  private async searchFaqs(
    input: Record<string, unknown>,
    context: AgentContext
  ): Promise<ToolResult> {
    const query = input.query as string

    if (!query || query.trim().length === 0) {
      return { success: false, error: 'Search query is required' }
    }

    const faqs = await this.rag.searchFaqs(context.tenantId, query)

    if (faqs.length === 0) {
      return {
        success: true,
        data: { faqs: [], message: 'No relevant FAQs found' },
      }
    }

    return {
      success: true,
      data: {
        faqs: faqs.map((f) => ({
          question: f.question,
          answer: f.answer,
          category: f.category,
        })),
      },
    }
  }

  /**
   * Create draft order from current cart
   */
  private async createOrder(
    input: Record<string, unknown>,
    context: AgentContext
  ): Promise<ToolResult> {
    const email = input.email as string
    const note = input.note as string | undefined

    if (!email || !email.includes('@')) {
      return { success: false, error: 'Valid email address is required' }
    }

    const cartId = this.getCartId(context)
    if (!cartId) {
      return { success: false, error: 'Cart is empty. Add items before creating order.' }
    }

    const tenant = await this.tenantService.getTenant(context.tenantId)
    if (!tenant) {
      return { success: false, error: 'Tenant not found' }
    }

    // Get cart to extract line items
    const storefront = this.shopifyFactory.createStorefrontClient(tenant as any)
    if (!storefront) {
      return { success: false, error: 'Shopify not configured' }
    }

    const cart = await storefront.getCart(cartId)
    if (cart.lines.length === 0) {
      return { success: false, error: 'Cart is empty' }
    }

    // Create draft order via Admin API
    const admin = this.shopifyFactory.createAdminClient(tenant as any)
    if (!admin) {
      // Fallback to checkout URL if Admin API not configured
      return {
        success: true,
        data: {
          checkoutUrl: cart.checkoutUrl,
          message: 'Please complete your order using the checkout link',
        },
      }
    }

    const draftOrder = await admin.createDraftOrder(
      cart.lines.map((line) => ({
        variantId: line.merchandiseId,
        quantity: line.quantity,
      })),
      email,
      note
    )

    return {
      success: true,
      data: {
        orderId: draftOrder.id,
        invoiceUrl: draftOrder.invoiceUrl,
        totalPrice: draftOrder.totalPrice,
        status: draftOrder.status,
        message: 'Draft order created. Check your email for the invoice.',
      },
    }
  }
}

/**
 * Factory function to create tool executor
 */
export function createToolExecutor(
  rag: RagService,
  tenantService: TenantService,
  shopifyFactory: typeof ShopifyFactory
): ToolExecutor {
  return new ToolExecutor(rag, tenantService, shopifyFactory)
}
