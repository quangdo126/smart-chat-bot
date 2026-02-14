# Phase 1: Setup Environment

## Context Links
- [Plan Overview](plan.md)
- [Backend Stack Report](../reports/researcher-260215-0128-backend-stack.md)

## Overview
- **Priority:** P1 - Critical
- **Status:** pending
- **Effort:** 3h

Initialize project structure with Hono for Cloudflare Workers, configure TypeScript, environment variables, and dependencies.

## Key Insights
- Hono is ultra-lightweight (~5KB), perfect for Cloudflare Workers
- Cloudflare Workers free tier: 100k req/day, sufficient for MVP
- Wrangler CLI handles local dev + deployment

## Requirements

### Functional
- Hono project with TypeScript
- Cloudflare Workers compatible
- Environment variable management
- Local development server

### Non-Functional
- Cold start <10ms
- Type-safe configuration
- .env file support for local dev

## Project Structure

```
smart-chat-bot/
├── src/
│   ├── index.ts              # Hono app entry
│   ├── routes/
│   │   ├── chat.ts           # Chat endpoints
│   │   └── health.ts         # Health check
│   ├── services/
│   │   ├── claudible.ts      # Claudible API client
│   │   ├── embeddings.ts     # OpenAI embeddings
│   │   ├── shopify.ts        # Shopify API client
│   │   └── rag.ts            # RAG pipeline
│   ├── db/
│   │   ├── client.ts         # Supabase client
│   │   └── schema.sql        # Database schema
│   ├── types/
│   │   └── index.ts          # Type definitions
│   └── config/
│       └── env.ts            # Environment config
├── widget/
│   ├── src/
│   │   ├── App.tsx           # React widget
│   │   ├── components/       # Chat components
│   │   └── hooks/            # Custom hooks
│   ├── vite.config.ts
│   └── package.json
├── extensions/
│   └── chat-widget/
│       ├── blocks/
│       │   └── chat-widget.liquid
│       └── assets/           # Built widget JS
├── wrangler.toml
├── package.json
├── tsconfig.json
└── .env.example
```

## Implementation Steps

### 1. Initialize Hono Project (30min)
```bash
npm create hono@latest . -- --template cloudflare-workers
npm install
```

### 2. Configure TypeScript (15min)
```json
// tsconfig.json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ES2022",
    "moduleResolution": "bundler",
    "strict": true,
    "lib": ["ES2022"],
    "types": ["@cloudflare/workers-types"]
  }
}
```

### 3. Install Dependencies (15min)
```bash
# Core
npm install hono @supabase/supabase-js

# Dev
npm install -D wrangler typescript @cloudflare/workers-types
```

### 4. Configure Wrangler (20min)
```toml
# wrangler.toml
name = "smart-chat-bot"
main = "src/index.ts"
compatibility_date = "2026-02-01"

[vars]
ENVIRONMENT = "development"

# Secrets (set via wrangler secret put)
# CLAUDIBLE_API_KEY
# SUPABASE_URL
# SUPABASE_ANON_KEY
# OPENAI_API_KEY
# SHOPIFY_STOREFRONT_TOKEN
# SHOPIFY_ADMIN_TOKEN
```

### 5. Create Environment Config (30min)
```typescript
// src/config/env.ts
export interface Env {
  ENVIRONMENT: string
  CLAUDIBLE_API_KEY: string
  SUPABASE_URL: string
  SUPABASE_ANON_KEY: string
  OPENAI_API_KEY: string
  SHOPIFY_STORE_DOMAIN: string
  SHOPIFY_STOREFRONT_TOKEN: string
  SHOPIFY_ADMIN_TOKEN: string
}

export function validateEnv(env: Env): void {
  const required = [
    'CLAUDIBLE_API_KEY',
    'SUPABASE_URL',
    'SUPABASE_ANON_KEY',
    'OPENAI_API_KEY'
  ]
  for (const key of required) {
    if (!env[key as keyof Env]) {
      throw new Error(`Missing required env var: ${key}`)
    }
  }
}
```

### 6. Create Base Hono App (30min)
```typescript
// src/index.ts
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'
import type { Env } from './config/env'

const app = new Hono<{ Bindings: Env }>()

// Middleware
app.use('*', logger())
app.use('*', cors({
  origin: ['https://*.myshopify.com'],
  allowMethods: ['GET', 'POST', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization']
}))

// Health check
app.get('/health', (c) => c.json({ status: 'ok', timestamp: Date.now() }))

// Export for Cloudflare Workers
export default app
```

### 7. Create .env.example (10min)
```env
# Claudible API (stealth bypass)
CLAUDIBLE_API_KEY=sk-your-key

# Supabase
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_ANON_KEY=eyJ...

# OpenAI (embeddings)
OPENAI_API_KEY=sk-...

# Shopify
SHOPIFY_STORE_DOMAIN=your-store.myshopify.com
SHOPIFY_STOREFRONT_TOKEN=shpat_xxx
SHOPIFY_ADMIN_TOKEN=shpat_xxx
```

### 8. Test Local Dev Server (10min)
```bash
npm run dev
# Visit http://localhost:8787/health
```

## Todo List
- [ ] Run `npm create hono@latest` with cloudflare-workers template
- [ ] Configure tsconfig.json for ES2022
- [ ] Install core dependencies (hono, supabase-js)
- [ ] Create wrangler.toml with env vars
- [ ] Create src/config/env.ts with validation
- [ ] Create src/index.ts with base app
- [ ] Create .env.example
- [ ] Test local dev server

## Success Criteria
- `npm run dev` starts local server on port 8787
- `/health` endpoint returns JSON `{ status: 'ok' }`
- TypeScript compiles without errors
- Environment validation catches missing vars

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Wrangler version mismatch | Low | Medium | Pin wrangler version in package.json |
| TypeScript config issues | Low | Low | Use Hono's template defaults |

## Security Considerations
- Never commit .env file (add to .gitignore)
- Use wrangler secret for production secrets
- Validate environment on app startup

## Next Steps
→ [Phase 2: Backend API](phase-02-backend-api.md)
