# Phase 6: AI Agent Logic

## Context Links
- [Plan Overview](plan.md)
- [Claudible Stealth Bypass](../../claudible-stealth-bypass.md)
- [RAG Architecture Report](../reports/researcher-260215-0128-rag-architecture.md)

## Overview
- **Priority:** P1 - Critical
- **Status:** pending
- **Effort:** 5h

Design system prompts, implement tool calling for actions, and create conversation flow logic for effective sales assistance.

## Key Insights
- Claude Haiku 4.5 supports tool calling via Anthropic API
- System prompt is top-level field (not in messages)
- RAG context should be injected per-turn, not in system prompt
- Actions: search, add to cart, create order

## Requirements

### Functional
- System prompt optimized for sales
- Tool definitions for Shopify actions
- Intent detection (search, purchase, FAQ)
- Context-aware responses
- Conversation memory management

### Non-Functional
- Response latency <2s first token
- Token usage optimization
- Graceful error handling

## Tool Definitions

### Available Tools
```typescript
interface Tool {
  name: string
  description: string
  input_schema: {
    type: 'object'
    properties: Record<string, unknown>
    required: string[]
  }
}

const tools: Tool[] = [
  {
    name: 'search_products',
    description: 'Search for products in the store. Use when customer asks about products, wants recommendations, or mentions a category.',
    input_schema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Search query - product name, category, or description keywords'
        },
        category: {
          type: 'string',
          description: 'Filter by category (optional)'
        },
        max_price: {
          type: 'number',
          description: 'Maximum price filter (optional)'
        }
      },
      required: ['query']
    }
  },
  {
    name: 'add_to_cart',
    description: 'Add a product to the customer cart. Use when customer explicitly wants to buy or add an item.',
    input_schema: {
      type: 'object',
      properties: {
        product_id: {
          type: 'string',
          description: 'Shopify product ID from search results'
        },
        variant_id: {
          type: 'string',
          description: 'Specific variant ID (required for products with variants)'
        },
        quantity: {
          type: 'number',
          description: 'Number of items to add (default: 1)'
        }
      },
      required: ['variant_id']
    }
  },
  {
    name: 'get_cart',
    description: 'Get current cart contents and total. Use when customer asks about their cart.',
    input_schema: {
      type: 'object',
      properties: {},
      required: []
    }
  },
  {
    name: 'create_order',
    description: 'Create a draft order for the customer. Use for phone/chat orders or when cart is ready.',
    input_schema: {
      type: 'object',
      properties: {
        email: {
          type: 'string',
          description: 'Customer email for order confirmation'
        },
        items: {
          type: 'array',
          description: 'Array of {variant_id, quantity} objects'
        },
        discount_percent: {
          type: 'number',
          description: 'Optional discount percentage'
        }
      },
      required: ['email', 'items']
    }
  },
  {
    name: 'search_faqs',
    description: 'Search FAQs for shipping, returns, policies. Use for non-product questions.',
    input_schema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Question or topic to search'
        }
      },
      required: ['query']
    }
  }
]
```

## System Prompt

```typescript
// src/prompts/sales-agent.ts
export const SALES_AGENT_SYSTEM_PROMPT = `You are a friendly and helpful sales assistant for an online dropshipping store.

## Your Role
- Help customers find products they're looking for
- Answer questions about products, shipping, and policies
- Assist with purchases and cart management
- Provide personalized recommendations

## Guidelines
1. Be conversational and warm, but efficient
2. Ask clarifying questions when the request is vague
3. Always recommend specific products with prices
4. Proactively suggest related items (upsell gently)
5. If you don't know something, admit it

## Response Format
- Keep responses concise (2-3 sentences max for simple queries)
- Use bullet points for product features
- Include prices when mentioning products
- End with a call-to-action when appropriate

## Tool Usage
- Use search_products for any product-related queries
- Use add_to_cart only when customer explicitly wants to buy
- Use search_faqs for shipping, returns, policy questions
- Use create_order for completing purchases via chat

## Important Rules
- Never make up product information - use search results only
- Always confirm before adding items to cart
- Don't share competitor information
- Be honest about stock availability
- Respect customer privacy

## Example Interactions
Customer: "Do you have any blue t-shirts under $30?"
→ Use search_products with query="blue t-shirt" max_price=30

Customer: "Add that to my cart"
→ Confirm which product, then use add_to_cart

Customer: "What's your return policy?"
→ Use search_faqs with query="return policy"`
```

## Implementation Steps

### 1. Tool Executor Service (1h)
```typescript
// src/services/tool-executor.ts
import { ShopifyStorefrontClient } from './shopify-storefront'
import { ShopifyAdminClient } from './shopify-admin'
import { RAGService } from './rag'

export interface ToolCall {
  id: string
  name: string
  input: Record<string, unknown>
}

export interface ToolResult {
  tool_use_id: string
  content: string
  is_error?: boolean
}

export class ToolExecutor {
  constructor(
    private storefront: ShopifyStorefrontClient,
    private admin: ShopifyAdminClient,
    private rag: RAGService,
    private context: { cartId?: string }
  ) {}

  async execute(toolCall: ToolCall): Promise<ToolResult> {
    try {
      const result = await this.executeInternal(toolCall)
      return {
        tool_use_id: toolCall.id,
        content: JSON.stringify(result)
      }
    } catch (error) {
      return {
        tool_use_id: toolCall.id,
        content: `Error: ${(error as Error).message}`,
        is_error: true
      }
    }
  }

  private async executeInternal(toolCall: ToolCall): Promise<unknown> {
    switch (toolCall.name) {
      case 'search_products': {
        const { query, category, max_price } = toolCall.input as {
          query: string
          category?: string
          max_price?: number
        }
        const results = await this.rag.searchProducts(query, {
          category,
          maxPrice: max_price,
          limit: 5
        })
        return {
          products: results.map(p => ({
            id: p.id,
            shopify_id: p.shopify_id,
            title: p.title,
            price: p.price,
            category: p.category,
            image: p.image_url,
            similarity: p.similarity
          }))
        }
      }

      case 'add_to_cart': {
        const { variant_id, quantity } = toolCall.input as {
          variant_id: string
          quantity?: number
        }

        if (this.context.cartId) {
          const cart = await this.storefront.addToCart(
            this.context.cartId,
            variant_id,
            quantity || 1
          )
          this.context.cartId = cart.id
          return {
            success: true,
            cart_id: cart.id,
            total_items: cart.totalQuantity,
            checkout_url: cart.checkoutUrl
          }
        } else {
          const cart = await this.storefront.createCart(variant_id, quantity || 1)
          this.context.cartId = cart.id
          return {
            success: true,
            cart_id: cart.id,
            total_items: cart.totalQuantity,
            checkout_url: cart.checkoutUrl
          }
        }
      }

      case 'get_cart': {
        if (!this.context.cartId) {
          return { items: [], total_items: 0, message: 'Cart is empty' }
        }
        // Would need to add getCart method to storefront client
        return { cart_id: this.context.cartId, message: 'Cart retrieved' }
      }

      case 'create_order': {
        const { email, items, discount_percent } = toolCall.input as {
          email: string
          items: Array<{ variant_id: string; quantity: number }>
          discount_percent?: number
        }

        const order = await this.admin.createDraftOrder({
          email,
          lineItems: items.map(i => ({
            variantId: i.variant_id,
            quantity: i.quantity
          })),
          discountPercent: discount_percent,
          note: 'Created via chat assistant'
        })

        return {
          success: true,
          order_id: order.id,
          total: order.totalPrice,
          invoice_url: order.invoiceUrl
        }
      }

      case 'search_faqs': {
        const { query } = toolCall.input as { query: string }
        const results = await this.rag.searchFAQs(query, 3)
        return {
          faqs: results.map(f => ({
            question: f.question,
            answer: f.answer
          }))
        }
      }

      default:
        throw new Error(`Unknown tool: ${toolCall.name}`)
    }
  }
}
```

### 2. Agent Orchestrator (1.5h)
```typescript
// src/services/agent.ts
import { ClaudibleClient } from './claudible'
import { ToolExecutor, ToolCall, ToolResult } from './tool-executor'
import { SALES_AGENT_SYSTEM_PROMPT } from '../prompts/sales-agent'
import { tools } from '../prompts/tools'

interface Message {
  role: 'user' | 'assistant'
  content: string | ContentBlock[]
}

interface ContentBlock {
  type: 'text' | 'tool_use' | 'tool_result'
  text?: string
  id?: string
  name?: string
  input?: Record<string, unknown>
  tool_use_id?: string
  content?: string
  is_error?: boolean
}

export class SalesAgent {
  constructor(
    private claudible: ClaudibleClient,
    private toolExecutor: ToolExecutor
  ) {}

  async *chat(
    userMessage: string,
    history: Message[] = []
  ): AsyncGenerator<{
    type: 'text' | 'tool_call' | 'tool_result' | 'products' | 'cart' | 'done'
    data: unknown
  }> {
    const messages: Message[] = [
      ...history,
      { role: 'user', content: userMessage }
    ]

    let continueLoop = true

    while (continueLoop) {
      // Call Claudible with tools
      const response = await this.claudible.chatWithTools(
        messages,
        SALES_AGENT_SYSTEM_PROMPT,
        tools
      )

      // Process response blocks
      const toolCalls: ToolCall[] = []
      let textContent = ''

      for (const block of response.content) {
        if (block.type === 'text') {
          textContent += block.text
          yield { type: 'text', data: block.text }
        } else if (block.type === 'tool_use') {
          toolCalls.push({
            id: block.id!,
            name: block.name!,
            input: block.input!
          })
          yield { type: 'tool_call', data: { name: block.name, input: block.input } }
        }
      }

      // If no tool calls, we're done
      if (toolCalls.length === 0) {
        continueLoop = false
        yield { type: 'done', data: null }
        break
      }

      // Execute tool calls and add results to messages
      const toolResults: ToolResult[] = []
      for (const toolCall of toolCalls) {
        const result = await this.toolExecutor.execute(toolCall)
        toolResults.push(result)

        // Emit special events for UI
        if (toolCall.name === 'search_products') {
          const parsed = JSON.parse(result.content)
          if (parsed.products) {
            yield { type: 'products', data: parsed.products }
          }
        } else if (toolCall.name === 'add_to_cart') {
          const parsed = JSON.parse(result.content)
          if (parsed.success) {
            yield { type: 'cart', data: parsed }
          }
        }

        yield { type: 'tool_result', data: result }
      }

      // Add assistant response and tool results to messages
      messages.push({
        role: 'assistant',
        content: response.content
      })

      messages.push({
        role: 'user',
        content: toolResults.map(r => ({
          type: 'tool_result' as const,
          tool_use_id: r.tool_use_id,
          content: r.content,
          is_error: r.is_error
        }))
      })

      // Continue loop to get final response after tool use
    }
  }
}
```

### 3. Updated Claudible Client with Tools (45min)
```typescript
// src/services/claudible.ts (add method)
interface ToolDefinition {
  name: string
  description: string
  input_schema: Record<string, unknown>
}

interface ChatResponse {
  content: Array<{
    type: 'text' | 'tool_use'
    text?: string
    id?: string
    name?: string
    input?: Record<string, unknown>
  }>
  stop_reason: 'end_turn' | 'tool_use'
  usage: { input_tokens: number; output_tokens: number }
}

async chatWithTools(
  messages: Array<{ role: string; content: unknown }>,
  systemPrompt: string,
  tools: ToolDefinition[]
): Promise<ChatResponse> {
  const response = await fetch(`${this.baseUrl}/messages`, {
    method: 'POST',
    headers: {
      'x-api-key': this.apiKey,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
      'X-Claude-Client': 'claude-code/2.1.2',
      'User-Agent': 'claude-code/2.1.2'
    },
    body: JSON.stringify({
      model: this.model,
      max_tokens: this.maxTokens,
      system: systemPrompt,
      tools,
      messages
    })
  })

  if (!response.ok) {
    throw new Error(`Claudible API error: ${response.status}`)
  }

  return response.json()
}
```

### 4. Update Chat Route with Agent (45min)
```typescript
// src/routes/chat.ts (updated)
import { SalesAgent } from '../services/agent'
import { ToolExecutor } from '../services/tool-executor'

chatRoutes.post('/chat/stream', async (c) => {
  const body = await c.req.json<ChatRequest>()

  if (!body.message?.trim()) {
    return c.json({ error: 'Message required' }, 400)
  }

  // Initialize services
  const db = createSupabaseClient(c.env)
  const embeddings = new EmbeddingsService(c.env.OPENAI_API_KEY)
  const rag = new RAGService(db, embeddings)
  const storefront = new ShopifyStorefrontClient({
    storeDomain: c.env.SHOPIFY_STORE_DOMAIN,
    storefrontToken: c.env.SHOPIFY_STOREFRONT_TOKEN
  })
  const admin = new ShopifyAdminClient({
    storeDomain: c.env.SHOPIFY_STORE_DOMAIN,
    adminToken: c.env.SHOPIFY_ADMIN_TOKEN
  })

  const context = { cartId: body.cartId }
  const toolExecutor = new ToolExecutor(storefront, admin, rag, context)
  const claudible = new ClaudibleClient({ apiKey: c.env.CLAUDIBLE_API_KEY })
  const agent = new SalesAgent(claudible, toolExecutor)

  // Get conversation history
  const conversation = new ConversationService(db)
  const history = body.conversationId
    ? await conversation.getHistory(body.conversationId)
    : []

  return streamSSE(c, async (stream) => {
    const conversationId = body.conversationId || await conversation.create(
      body.shopDomain || 'unknown',
      body.customerId
    )

    await stream.writeSSE({
      event: 'start',
      data: JSON.stringify({ conversationId })
    })

    try {
      for await (const event of agent.chat(body.message, history)) {
        switch (event.type) {
          case 'text':
            await stream.writeSSE({
              event: 'delta',
              data: JSON.stringify({ text: event.data })
            })
            break

          case 'products':
            await stream.writeSSE({
              event: 'products',
              data: JSON.stringify({ products: event.data })
            })
            break

          case 'cart':
            await stream.writeSSE({
              event: 'cart',
              data: JSON.stringify(event.data)
            })
            break

          case 'done':
            await stream.writeSSE({
              event: 'done',
              data: JSON.stringify({
                conversationId,
                cartId: context.cartId
              })
            })
            break
        }
      }

      // Save messages to history
      await conversation.addMessage(conversationId, 'user', body.message)
      // Note: Would need to accumulate assistant response

    } catch (error) {
      await stream.writeSSE({
        event: 'error',
        data: JSON.stringify({ error: 'Agent error' })
      })
    }
  })
})
```

### 5. Intent Optimization (30min)
```typescript
// src/services/intent-detector.ts
// Lightweight pre-check before full agent call

export type Intent =
  | 'product_search'
  | 'add_to_cart'
  | 'order_status'
  | 'faq'
  | 'greeting'
  | 'general'

const INTENT_PATTERNS: Record<Intent, RegExp[]> = {
  product_search: [
    /looking for|find me|show me|do you have|searching for/i,
    /any .+\?$/i,
    /recommend|suggest/i
  ],
  add_to_cart: [
    /add .+ to cart|buy .+|purchase|i('ll| will) take/i,
    /want to order|want to buy/i
  ],
  order_status: [
    /where.+order|track.+order|order status/i,
    /delivery|shipping status/i
  ],
  faq: [
    /return policy|shipping|refund|exchange/i,
    /how (long|much)|what is your/i
  ],
  greeting: [
    /^(hi|hello|hey|good morning|good afternoon)/i
  ],
  general: []
}

export function detectIntent(message: string): Intent {
  for (const [intent, patterns] of Object.entries(INTENT_PATTERNS)) {
    for (const pattern of patterns) {
      if (pattern.test(message)) {
        return intent as Intent
      }
    }
  }
  return 'general'
}

// Use to pre-fetch context before agent call
export async function prefetchContext(
  intent: Intent,
  message: string,
  rag: RAGService
): Promise<string> {
  switch (intent) {
    case 'product_search':
      const products = await rag.searchProducts(message, { limit: 3 })
      if (products.length > 0) {
        return `## Quick Product Matches\n${products.map(p =>
          `- ${p.title} ($${p.price})`
        ).join('\n')}`
      }
      return ''

    case 'faq':
      const faqs = await rag.searchFAQs(message, 2)
      if (faqs.length > 0) {
        return `## Relevant FAQs\n${faqs.map(f =>
          `Q: ${f.question}\nA: ${f.answer}`
        ).join('\n\n')}`
      }
      return ''

    default:
      return ''
  }
}
```

## Todo List
- [ ] Create tool definitions in `src/prompts/tools.ts`
- [ ] Create system prompt in `src/prompts/sales-agent.ts`
- [ ] Create `src/services/tool-executor.ts`
- [ ] Create `src/services/agent.ts`
- [ ] Update Claudible client with `chatWithTools` method
- [ ] Update chat route with agent orchestration
- [ ] Create `src/services/intent-detector.ts` (optional optimization)
- [ ] Test tool calling end-to-end
- [ ] Test multi-turn conversations

## Success Criteria
- Agent correctly identifies when to use tools
- Product search returns relevant results
- Add to cart updates cart state
- Multi-turn conversations maintain context
- Error handling is graceful

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Tool call infinite loop | Low | High | Max iteration limit (5 turns) |
| Hallucinated product info | Medium | High | Only show RAG results, never fabricate |
| High token usage | Medium | Medium | Optimize system prompt, cache context |

## Security Considerations
- Validate tool inputs before execution
- Rate limit tool calls per conversation
- Don't expose internal errors to user
- Sanitize tool results before LLM

## Next Steps
→ [Phase 7: Testing & Deployment](phase-07-testing-deployment.md)
