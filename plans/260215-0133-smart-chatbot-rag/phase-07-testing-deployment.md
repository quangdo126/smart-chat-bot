# Phase 7: Testing & Deployment

## Context Links
- [Plan Overview](plan.md)
- [Backend Stack Report](../reports/researcher-260215-0128-backend-stack.md)

## Overview
- **Priority:** P1 - Critical
- **Status:** pending
- **Effort:** 3h

Write tests for critical paths, deploy to Cloudflare Workers, and configure Shopify app for production.

## Key Insights
- Vitest for unit/integration tests (Vite-native)
- Cloudflare Workers has different test environment
- Shopify app requires HTTPS for webhooks
- Secrets managed via wrangler secret

## Requirements

### Functional
- Unit tests for services
- Integration tests for API endpoints
- E2E test for chat flow
- Deployment to Cloudflare Workers
- Shopify app configuration

### Non-Functional
- >80% code coverage for critical paths
- Zero-downtime deployment
- Monitoring and logging

## Test Strategy

### Unit Tests
- `claudible.ts` - API client
- `embeddings.ts` - OpenAI embeddings
- `rag.ts` - Vector search
- `tool-executor.ts` - Tool execution

### Integration Tests
- `/api/chat` - Full chat flow
- `/api/chat/stream` - SSE streaming
- `/shopify/sync` - Product sync

### E2E Tests
- Widget opens/closes
- Send message, receive response
- Product recommendation flow
- Add to cart flow

## Implementation Steps

### 1. Test Setup (20min)
```bash
npm install -D vitest @cloudflare/vitest-pool-workers
```

```typescript
// vitest.config.ts
import { defineWorkersConfig } from '@cloudflare/vitest-pool-workers/config'

export default defineWorkersConfig({
  test: {
    poolOptions: {
      workers: {
        wrangler: { configPath: './wrangler.toml' }
      }
    }
  }
})
```

### 2. Claudible Client Tests (30min)
```typescript
// src/services/__tests__/claudible.test.ts
import { describe, it, expect, vi } from 'vitest'
import { ClaudibleClient } from '../claudible'

describe('ClaudibleClient', () => {
  it('should send correct headers for stealth bypass', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({
        content: [{ type: 'text', text: 'Hello' }],
        usage: { input_tokens: 10, output_tokens: 5 }
      }))
    )

    const client = new ClaudibleClient({ apiKey: 'test-key' })
    await client.chat([{ role: 'user', content: 'Hi' }], 'System prompt')

    expect(fetchSpy).toHaveBeenCalledWith(
      'https://claudible.io/v1/messages',
      expect.objectContaining({
        headers: expect.objectContaining({
          'X-Claude-Client': 'claude-code/2.1.2',
          'User-Agent': 'claude-code/2.1.2',
          'x-api-key': 'test-key'
        })
      })
    )
  })

  it('should extract text from response correctly', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({
        content: [
          { type: 'text', text: 'Hello ' },
          { type: 'text', text: 'World' }
        ],
        usage: { input_tokens: 10, output_tokens: 5 }
      }))
    )

    const client = new ClaudibleClient({ apiKey: 'test-key' })
    const result = await client.chat([{ role: 'user', content: 'Hi' }], '')

    expect(result).toBe('Hello World')
  })

  it('should place system prompt at top level', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({
        content: [{ type: 'text', text: 'OK' }],
        usage: { input_tokens: 10, output_tokens: 5 }
      }))
    )

    const client = new ClaudibleClient({ apiKey: 'test-key' })
    await client.chat([{ role: 'user', content: 'Hi' }], 'Be helpful')

    const body = JSON.parse(fetchSpy.mock.calls[0][1].body)
    expect(body.system).toBe('Be helpful')
    expect(body.messages).not.toContainEqual(
      expect.objectContaining({ role: 'system' })
    )
  })
})
```

### 3. RAG Service Tests (30min)
```typescript
// src/services/__tests__/rag.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { RAGService } from '../rag'
import { EmbeddingsService } from '../embeddings'

describe('RAGService', () => {
  let mockDb: any
  let mockEmbeddings: EmbeddingsService
  let rag: RAGService

  beforeEach(() => {
    mockEmbeddings = {
      embed: vi.fn().mockResolvedValue(new Array(1536).fill(0.1)),
      embedBatch: vi.fn().mockResolvedValue([
        new Array(1536).fill(0.1),
        new Array(1536).fill(0.2)
      ])
    } as unknown as EmbeddingsService

    mockDb = {
      rpc: vi.fn(),
      from: vi.fn().mockReturnValue({
        upsert: vi.fn().mockResolvedValue({ error: null })
      })
    }

    rag = new RAGService(mockDb, mockEmbeddings)
  })

  it('should search products with filters', async () => {
    mockDb.rpc.mockResolvedValue({
      data: [
        { id: '1', title: 'Blue T-Shirt', price: 25, similarity: 0.85 }
      ],
      error: null
    })

    const results = await rag.searchProducts('blue shirt', {
      maxPrice: 30,
      category: 'clothing'
    })

    expect(mockDb.rpc).toHaveBeenCalledWith('search_products', {
      query_embedding: expect.any(Array),
      match_threshold: 0.5,
      match_count: 5,
      filter_category: 'clothing',
      filter_max_price: 30,
      filter_available: true
    })

    expect(results).toHaveLength(1)
    expect(results[0].title).toBe('Blue T-Shirt')
  })

  it('should build context from products and FAQs', async () => {
    mockDb.rpc
      .mockResolvedValueOnce({
        data: [{ title: 'Product A', price: 10, description: 'Great item' }],
        error: null
      })
      .mockResolvedValueOnce({
        data: [{ question: 'Return policy?', answer: '30 day returns' }],
        error: null
      })

    const context = await rag.buildContext('return policy products')

    expect(context).toContain('Product A')
    expect(context).toContain('$10')
    expect(context).toContain('Return policy?')
    expect(context).toContain('30 day returns')
  })
})
```

### 4. API Integration Tests (30min)
```typescript
// src/__tests__/api.test.ts
import { describe, it, expect, beforeAll } from 'vitest'
import { env, SELF } from 'cloudflare:test'

describe('Chat API', () => {
  it('should return health check', async () => {
    const response = await SELF.fetch('http://localhost/health')
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.status).toBe('ok')
  })

  it('should reject empty messages', async () => {
    const response = await SELF.fetch('http://localhost/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: '' })
    })

    expect(response.status).toBe(400)
    const data = await response.json()
    expect(data.error).toBe('Message required')
  })

  it('should include rate limit headers', async () => {
    const response = await SELF.fetch('http://localhost/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'Hello' })
    })

    expect(response.headers.get('X-RateLimit-Limit')).toBeDefined()
    expect(response.headers.get('X-RateLimit-Remaining')).toBeDefined()
  })
})
```

### 5. Deployment Configuration (20min)
```toml
# wrangler.toml (production)
name = "smart-chat-bot"
main = "src/index.ts"
compatibility_date = "2026-02-01"
compatibility_flags = ["nodejs_compat"]

[env.production]
vars = { ENVIRONMENT = "production" }
routes = [
  { pattern = "chat-api.yourdomain.com/*", zone_name = "yourdomain.com" }
]

# KV for rate limiting (optional)
[[env.production.kv_namespaces]]
binding = "RATE_LIMIT_KV"
id = "xxx"

[observability]
enabled = true
```

### 6. Deployment Scripts (20min)
```json
// package.json scripts
{
  "scripts": {
    "dev": "wrangler dev",
    "test": "vitest",
    "test:coverage": "vitest run --coverage",
    "build": "wrangler deploy --dry-run",
    "deploy": "wrangler deploy",
    "deploy:prod": "wrangler deploy --env production",
    "secrets:set": "wrangler secret put CLAUDIBLE_API_KEY && wrangler secret put SUPABASE_URL && wrangler secret put SUPABASE_ANON_KEY && wrangler secret put OPENAI_API_KEY && wrangler secret put SHOPIFY_STOREFRONT_TOKEN && wrangler secret put SHOPIFY_ADMIN_TOKEN"
  }
}
```

### 7. Set Production Secrets (15min)
```bash
# Set secrets for production
wrangler secret put CLAUDIBLE_API_KEY --env production
wrangler secret put SUPABASE_URL --env production
wrangler secret put SUPABASE_ANON_KEY --env production
wrangler secret put OPENAI_API_KEY --env production
wrangler secret put SHOPIFY_STORE_DOMAIN --env production
wrangler secret put SHOPIFY_STOREFRONT_TOKEN --env production
wrangler secret put SHOPIFY_ADMIN_TOKEN --env production
```

### 8. Deploy to Cloudflare (15min)
```bash
# Build and deploy
npm run deploy:prod

# Verify deployment
curl https://smart-chat-bot.your-subdomain.workers.dev/health
```

### 9. Widget Build & Deploy (15min)
```bash
# Build widget
cd widget
npm run build

# Widget is now in extensions/chat-widget/assets/widget.js
# For Shopify, deploy as Theme App Extension or upload to CDN
```

### 10. Shopify App Configuration (30min)

**Partner Dashboard Setup:**
1. Go to partners.shopify.com
2. Create new app or use existing
3. Configure App URLs:
   - App URL: `https://smart-chat-bot.workers.dev`
   - Allowed redirection URLs: `https://smart-chat-bot.workers.dev/auth/callback`

**API Scopes Required:**
- `read_products` - Product data
- `write_draft_orders` - Create orders
- `read_customers` - Customer info

**Theme App Extension:**
```bash
# In Shopify CLI
shopify app deploy
```

**Webhook Configuration:**
- `products/create` → `/shopify/webhooks/products/update`
- `products/update` → `/shopify/webhooks/products/update`
- `products/delete` → `/shopify/webhooks/products/delete`

## Todo List
- [ ] Install vitest and configure
- [ ] Write Claudible client tests
- [ ] Write RAG service tests
- [ ] Write API integration tests
- [ ] Configure wrangler.toml for production
- [ ] Set production secrets
- [ ] Deploy to Cloudflare Workers
- [ ] Build widget for production
- [ ] Configure Shopify app in Partner Dashboard
- [ ] Deploy Theme App Extension
- [ ] Test end-to-end in Shopify store

## Success Criteria
- All tests pass
- Deployment to Cloudflare successful
- API accessible via custom domain
- Widget loads in Shopify store
- Chat flow works end-to-end
- Webhooks receive product updates

## Monitoring & Observability

### Cloudflare Analytics
- Request count, latency, errors
- Enable in wrangler.toml: `observability.enabled = true`

### Logging
```typescript
// Add structured logging
console.log(JSON.stringify({
  level: 'info',
  event: 'chat_message',
  conversation_id: conversationId,
  duration_ms: Date.now() - startTime
}))
```

### Error Tracking (Optional)
- Sentry for Cloudflare Workers
- Or log errors to Supabase table

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Deployment failure | Low | High | Test with --dry-run first |
| Secret leak | Low | Critical | Use wrangler secret, never commit |
| Shopify app rejection | Medium | Medium | Follow Shopify guidelines |

## Security Checklist
- [ ] All secrets in wrangler secret (not env vars)
- [ ] CORS configured for Shopify domains only
- [ ] Rate limiting enabled
- [ ] Webhook signatures verified
- [ ] No sensitive data in logs
- [ ] HTTPS enforced

## Post-Deployment
1. Monitor first 24 hours for errors
2. Test product sync webhook
3. Verify conversation persistence
4. Check token usage and costs
5. Gather user feedback

## Unresolved Questions
1. Custom domain SSL - using Cloudflare or separate cert?
2. Backup strategy for Supabase data?
3. Staging environment needed?
4. A/B testing for system prompts?
