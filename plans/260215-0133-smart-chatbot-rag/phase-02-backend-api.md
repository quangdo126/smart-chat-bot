# Phase 2: Backend API

## Context Links
- [Plan Overview](plan.md)
- [Claudible Stealth Bypass](../../claudible-stealth-bypass.md)
- [Backend Stack Report](../reports/researcher-260215-0128-backend-stack.md)

## Overview
- **Priority:** P1 - Critical
- **Status:** pending
- **Effort:** 5h

Implement Hono API with Claudible integration and SSE streaming for real-time chat responses.

## Key Insights
- Claudible `/v1/messages` requires stealth headers: `X-Claude-Client`, `User-Agent`
- System prompt is top-level field, NOT in messages array
- SSE via Hono's `streamSSE` helper for token streaming
- Must handle Anthropic response format (content array)

## Requirements

### Functional
- POST /api/chat - Send message, get streaming response
- GET /api/chat/stream - SSE endpoint for responses
- Conversation history management
- Error handling with proper HTTP codes

### Non-Functional
- Response streaming <100ms first token
- Rate limiting: 100 req/min per IP
- CORS for Shopify domains

## Architecture

```
POST /api/chat
    ↓
Validate Input → Build Context (RAG) → Claudible API
    ↓
SSE Stream → Client
```

## Related Code Files

### Create
- `src/routes/chat.ts` - Chat endpoints
- `src/services/claudible.ts` - Claudible API client
- `src/middleware/rate-limit.ts` - Rate limiting

### Modify
- `src/index.ts` - Register routes

## Implementation Steps

### 1. Claudible API Client (1h)
```typescript
// src/services/claudible.ts
interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

interface ClaudibleConfig {
  apiKey: string
  model?: string
  maxTokens?: number
}

interface StreamChunk {
  type: 'content_block_delta' | 'message_stop'
  delta?: { type: 'text_delta'; text: string }
}

export class ClaudibleClient {
  private baseUrl = 'https://claudible.io/v1'
  private model: string
  private maxTokens: number
  private apiKey: string

  constructor(config: ClaudibleConfig) {
    this.apiKey = config.apiKey
    this.model = config.model ?? 'claude-haiku-4.5'
    this.maxTokens = config.maxTokens ?? 2048
  }

  async *streamChat(
    messages: ChatMessage[],
    systemPrompt: string
  ): AsyncGenerator<string> {
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
        stream: true,
        system: systemPrompt,
        messages: messages.map(m => ({
          role: m.role,
          content: m.content
        }))
      })
    })

    if (!response.ok) {
      throw new Error(`Claudible API error: ${response.status}`)
    }

    const reader = response.body?.getReader()
    if (!reader) throw new Error('No response body')

    const decoder = new TextDecoder()
    let buffer = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6)
          if (data === '[DONE]') return
          try {
            const chunk: StreamChunk = JSON.parse(data)
            if (chunk.type === 'content_block_delta' && chunk.delta?.text) {
              yield chunk.delta.text
            }
          } catch {
            // Skip invalid JSON
          }
        }
      }
    }
  }

  async chat(
    messages: ChatMessage[],
    systemPrompt: string
  ): Promise<string> {
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
        messages
      })
    })

    if (!response.ok) {
      throw new Error(`Claudible API error: ${response.status}`)
    }

    const data = await response.json()
    return data.content
      .filter((c: any) => c.type === 'text')
      .map((c: any) => c.text)
      .join('')
  }
}
```

### 2. Chat Routes (1.5h)
```typescript
// src/routes/chat.ts
import { Hono } from 'hono'
import { streamSSE } from 'hono/streaming'
import { ClaudibleClient } from '../services/claudible'
import type { Env } from '../config/env'

interface ChatRequest {
  message: string
  conversationId?: string
  history?: Array<{ role: 'user' | 'assistant'; content: string }>
}

const chatRoutes = new Hono<{ Bindings: Env }>()

// System prompt for sales chatbot
const SYSTEM_PROMPT = `You are a helpful sales assistant for an online store.
Your goal is to help customers find products, answer questions, and assist with purchases.
Be friendly, concise, and helpful. If you don't know something, say so.

When recommending products, include:
- Product name
- Price
- Key features
- Why it's a good fit

Available actions:
- Search products
- Add to cart
- Create order
- Answer FAQs`

chatRoutes.post('/chat', async (c) => {
  const body = await c.req.json<ChatRequest>()

  if (!body.message?.trim()) {
    return c.json({ error: 'Message required' }, 400)
  }

  const client = new ClaudibleClient({
    apiKey: c.env.CLAUDIBLE_API_KEY
  })

  const messages = [
    ...(body.history || []),
    { role: 'user' as const, content: body.message }
  ]

  // Non-streaming response
  const response = await client.chat(messages, SYSTEM_PROMPT)

  return c.json({
    message: response,
    conversationId: body.conversationId || crypto.randomUUID()
  })
})

chatRoutes.post('/chat/stream', async (c) => {
  const body = await c.req.json<ChatRequest>()

  if (!body.message?.trim()) {
    return c.json({ error: 'Message required' }, 400)
  }

  const client = new ClaudibleClient({
    apiKey: c.env.CLAUDIBLE_API_KEY
  })

  const messages = [
    ...(body.history || []),
    { role: 'user' as const, content: body.message }
  ]

  return streamSSE(c, async (stream) => {
    const conversationId = body.conversationId || crypto.randomUUID()

    await stream.writeSSE({
      event: 'start',
      data: JSON.stringify({ conversationId })
    })

    try {
      for await (const chunk of client.streamChat(messages, SYSTEM_PROMPT)) {
        await stream.writeSSE({
          event: 'delta',
          data: JSON.stringify({ text: chunk })
        })
      }

      await stream.writeSSE({
        event: 'done',
        data: JSON.stringify({ conversationId })
      })
    } catch (error) {
      await stream.writeSSE({
        event: 'error',
        data: JSON.stringify({ error: 'Stream error' })
      })
    }
  })
})

export { chatRoutes }
```

### 3. Rate Limiting Middleware (45min)
```typescript
// src/middleware/rate-limit.ts
import { Context, Next } from 'hono'

interface RateLimitState {
  count: number
  resetAt: number
}

// In-memory store (per Worker isolate)
const rateLimitStore = new Map<string, RateLimitState>()

export function rateLimit(options: {
  max: number
  windowMs: number
}) {
  return async (c: Context, next: Next) => {
    const key = c.req.header('CF-Connecting-IP') || 'unknown'
    const now = Date.now()

    let state = rateLimitStore.get(key)

    if (!state || now > state.resetAt) {
      state = { count: 0, resetAt: now + options.windowMs }
      rateLimitStore.set(key, state)
    }

    state.count++

    if (state.count > options.max) {
      return c.json(
        { error: 'Rate limit exceeded', retryAfter: Math.ceil((state.resetAt - now) / 1000) },
        429
      )
    }

    c.header('X-RateLimit-Limit', options.max.toString())
    c.header('X-RateLimit-Remaining', (options.max - state.count).toString())
    c.header('X-RateLimit-Reset', Math.ceil(state.resetAt / 1000).toString())

    await next()
  }
}
```

### 4. Register Routes (30min)
```typescript
// src/index.ts (updated)
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'
import { chatRoutes } from './routes/chat'
import { rateLimit } from './middleware/rate-limit'
import type { Env } from './config/env'

const app = new Hono<{ Bindings: Env }>()

// Global middleware
app.use('*', logger())
app.use('*', cors({
  origin: (origin) => {
    if (!origin) return '*'
    if (origin.endsWith('.myshopify.com')) return origin
    if (origin.includes('localhost')) return origin
    return null
  },
  allowMethods: ['GET', 'POST', 'OPTIONS'],
  allowHeaders: ['Content-Type']
}))

// Rate limit chat endpoints
app.use('/api/chat*', rateLimit({ max: 100, windowMs: 60000 }))

// Routes
app.get('/health', (c) => c.json({ status: 'ok', timestamp: Date.now() }))
app.route('/api', chatRoutes)

// 404 handler
app.notFound((c) => c.json({ error: 'Not found' }, 404))

// Error handler
app.onError((err, c) => {
  console.error('Error:', err)
  return c.json({ error: 'Internal server error' }, 500)
})

export default app
```

### 5. Test SSE Streaming (30min)
```bash
# Test non-streaming
curl -X POST http://localhost:8787/api/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "What products do you have?"}'

# Test streaming
curl -N -X POST http://localhost:8787/api/chat/stream \
  -H "Content-Type: application/json" \
  -d '{"message": "Tell me about your best selling items"}'
```

## Todo List
- [ ] Create `src/services/claudible.ts` with streaming support
- [ ] Create `src/routes/chat.ts` with POST /chat and /chat/stream
- [ ] Create `src/middleware/rate-limit.ts`
- [ ] Update `src/index.ts` with routes and middleware
- [ ] Test streaming with curl
- [ ] Add error handling for Claudible API failures

## Success Criteria
- POST /api/chat returns JSON response
- POST /api/chat/stream returns SSE events
- Rate limit headers present in responses
- 429 returned when limit exceeded
- Graceful error handling for API failures

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Claudible API changes | Low | High | Monitor API, have fallback to /v1/responses |
| SSE connection drops | Medium | Medium | Client-side reconnection logic |
| Rate limit bypass | Low | Medium | Use CF-Connecting-IP header |

## Security Considerations
- Validate message content (max 4000 chars)
- Sanitize user input before sending to LLM
- Don't expose API keys in error messages
- Log but don't expose internal errors

## Next Steps
→ [Phase 3: Database & RAG](phase-03-database-rag.md)
