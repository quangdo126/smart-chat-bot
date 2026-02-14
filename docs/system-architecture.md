# Smart Chat Bot - System Architecture

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                      Shopify Store                              │
│                 (Any e-commerce website)                        │
├─────────────────────────────────────────────────────────────────┤
│  HTML/CSS/JS                                                    │
│  <script src="https://cdn.../widget/embed.js"></script>         │
└──────────────┬──────────────────────────────────────────────────┘
               │ (1) Load embed script
┌──────────────▼──────────────────────────────────────────────────┐
│         Preact Chat Widget                                      │
│   (Cloudflare Pages CDN - static hosting)                       │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  Components:                                             │  │
│  │  - ChatBubble (floating UI)                             │  │
│  │  - ChatMessages (message list)                          │  │
│  │  - ChatInput (user input)                               │  │
│  │  - ProductCard (product recommendations)                │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  Hooks:                                                  │  │
│  │  - useChat (message state, send logic)                  │  │
│  │  - useSSE (server-sent events stream)                   │  │
│  └──────────────────────────────────────────────────────────┘  │
└──────────────┬──────────────────────────────────────────────────┘
               │ (2) HTTP POST + SSE
               │ Headers: X-Tenant-ID
┌──────────────▼──────────────────────────────────────────────────┐
│     Hono API - Cloudflare Workers (Serverless)                  │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  Middleware:                                             │  │
│  │  - CORS (allow all origins for widget)                  │  │
│  │  - Logger (request/response logging)                    │  │
│  │  - Tenant extraction (X-Tenant-ID header)               │  │
│  │  - Tenant validation (/api/* routes)                    │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  Routes:                                                 │  │
│  │  POST /api/chat - Basic streaming chat                  │  │
│  │  POST /api/chat/sync - Synchronous response             │  │
│  │  POST /api/chat/agent - Agent with tools                │  │
│  │  POST /api/chat/agent/stream - Agent streaming          │  │
│  │  GET /health - Health check                             │  │
│  └──────────────────────────────────────────────────────────┘  │
└──────────────┬──────────────────────────────────────────────────┘
               │ (3) REST API calls
    ┌──────────┴────────────┬──────────────┬────────────┐
    │                       │              │            │
    ▼                       ▼              ▼            ▼
[TenantService]      [ChatAgent]      [RAGService]  [External APIs]
 Load config          Orchestrate       Vector         │
                      conversation      search         ├─ Claudible
  ┌─────────┐                          │              ├─ Voyage AI
  │Supabase │                          ├─ Search       ├─ Shopify Admin
  │PostgreSQL                          │  products    └─ Shopify Storefront
  │pgvector │                          ├─ Get cart
  │         │                          ├─ Add to cart
  └─────────┘                          └─ Update cart
```

## Component Architecture

### 1. Frontend Layer - Preact Widget

**Purpose:** Embeddable chat UI for customer interaction

**Technologies:**
- Preact (8KB UI framework)
- Vite (fast build tool)
- Vanilla CSS (no dependencies)
- Server-Sent Events (streaming)

**Key Components:**

```typescript
ChatBubble
├── ChatMessages (read-only message list)
├── ChatInput (user message submission)
├── ProductCard (product recommendations)
└── CartButton (quick actions)
```

**State Management:**
- `useChat()` hook manages messages, loading state
- `useSSE()` hook handles streaming events from server
- Session ID persisted in localStorage

**Communication:**
- POST requests to `/api/chat/*` endpoints
- SSE connection for streaming responses
- Expects X-Tenant-ID from parent window

### 2. API Layer - Cloudflare Workers

**Purpose:** Serverless API with global edge deployment

**Technologies:**
- Hono (lightweight web framework)
- TypeScript (type safety)
- Cloudflare Workers runtime (global edge)
- Cloudflare KV (session storage, optional)

**Middleware Stack:**

```
Request
  │
  ├─► CORS Middleware (allow all origins)
  ├─► Logger Middleware (console.log)
  ├─► Tenant Extraction (X-Tenant-ID header)
  ├─► Tenant Validation (required for /api/*)
  │
  └─► Route Handler
```

**Route Handlers:**

1. **POST /api/chat** - Basic streaming chat
   - Accepts: messages, optional systemPrompt
   - Returns: SSE stream with text chunks
   - Client: Claudible API only
   - Use Case: Simple chatbot without agents

2. **POST /api/chat/sync** - Synchronous response
   - Accepts: messages, optional systemPrompt
   - Returns: Full response at once
   - Use Case: Testing, non-streaming clients

3. **POST /api/chat/agent** - Agent with tool calling
   - Accepts: messages, sessionId, optional cartId
   - Returns: Full response with tool execution logs
   - Use Case: Complex interactions requiring tools
   - Features: Product search, cart management, etc

4. **POST /api/chat/agent/stream** - Agent streaming
   - Accepts: Same as agent
   - Returns: SSE stream with events
   - Event Types: tool_call, tool_result, message, done
   - Use Case: Real-time agent progress visibility

### 3. Service Layer

**TenantService**
- Loads tenant configuration from database
- Validates authorization
- Caches settings (optional)

**ChatAgent**
- Orchestrates conversation flow
- Manages tool calling (function calling)
- Maintains context across turns
- Returns structured responses with tool logs

**RAGService**
- Vector similarity search
- Document retrieval and ranking
- Configurable thresholds per tenant
- Returns context window for prompts

**EmbeddingsService**
- Creates vector embeddings using Voyage AI API
- Converts text to 1024-dim vector (voyage-3-lite)
- Uses input_type: 'query' for searches, 'document' for indexing

**ClaudibleClient**
- Wraps Claudible API
- Handles streaming responses
- Message format: `{ role, content }`
- Supports system prompts

**ShopifyFactory + Clients**
- Admin API client (server-side operations)
- Storefront API client (public operations)
- Query builders for GraphQL
- Product search, cart management

### 4. Data Layer - Supabase PostgreSQL

**Technologies:**
- PostgreSQL database
- pgvector extension (vector embeddings)
- Row-level security (optional tenant isolation)
- Connection pooling

**Schema:**

```sql
-- Multi-tenancy root
tenants (id, name, shopify_domain, widget_settings, rag_config)

-- Documents for RAG
documents (
  id,
  tenant_id,      -- FK: tenants.id
  content,        -- Original text
  embedding,      -- pgvector (1024 dims)
  metadata,       -- JSON: source, url, etc
  created_at
)
CREATE INDEX ON documents USING ivfflat (embedding vector_cosine_ops)

-- Chat sessions
chat_sessions (
  id,
  tenant_id,      -- FK: tenants.id
  visitor_id,     -- Unique per session
  created_at,
  last_active_at
)

-- Message history
chat_messages (
  id,
  session_id,     -- FK: chat_sessions.id
  tenant_id,      -- Denormalized for queries
  role,           -- 'user' | 'assistant' | 'system'
  content,        -- Message text
  metadata,       -- JSON: tool_calls, etc
  timestamp
)
```

**Key Indexes:**
- `documents(tenant_id, created_at)` - List by tenant
- `documents(embedding)` - Vector similarity search (ivfflat)
- `chat_messages(session_id, timestamp)` - Message history
- `chat_sessions(tenant_id, visitor_id)` - Session lookup

## Data Flow Scenarios

### Scenario 1: Basic Chat (No Agent)

```
1. Widget sends POST /api/chat
   └─ body: { messages: [...], systemPrompt: "..." }
   └─ header: X-Tenant-ID: tenant-123

2. API handler validates request

3. Get Claudible client from env.CLAUDIBLE_API_KEY

4. Stream responses from Claudible.chatStream()
   └─ Send SSE events with text chunks

5. Widget receives SSE events
   └─ Append to message list in real-time

6. SSE stream ends with 'done' event
```

**Services Used:** ClaudibleClient, CORS, Logger

### Scenario 2: Agent with Tool Calling

```
1. Widget sends POST /api/chat/agent
   └─ body: { messages: [...], sessionId: "...", cartId?: "..." }

2. API creates services:
   └─ ChatAgent, RAGService, TenantService, ShopifyFactory

3. ChatAgent.processMessage() loop:

   ITERATION 1 (User message):
   ├─ Call Claudible API
   ├─ Response contains: tool_use block
   ├─ Parse tools: [
   │   { name: "search_products", input: { query: "shoes" } }
   │ ]
   ├─ Execute tool
   │ └─ RAGService.searchDocuments() → ShopifyStorefront.search()
   │ └─ Return: [Product, Product, ...]
   └─ Add tool result to messages

   ITERATION 2 (Tool result):
   ├─ Call Claudible API with history + tool result
   ├─ Response: text only (no more tools)
   └─ Return to client

4. Return AgentResponse with:
   └─ reply: "Here are matching shoes..."
   └─ toolCalls: [{ tool, input, result }]

5. Widget displays response + product cards
```

**Services Used:** ChatAgent, RAGService, ShopifyFactory, EmbeddingsService, Claudible

### Scenario 3: RAG-Enhanced Chat

```
1. User asks: "Do you have winter boots?"

2. ChatAgent.processMessage():
   ├─ Extract intent: product search
   └─ Create embedding from user message

3. RAGService.searchDocuments():
   ├─ Send embedding to Supabase
   ├─ Query: SELECT * FROM documents
   │         WHERE tenant_id = 'tenant-123'
   │         ORDER BY embedding <=> query_embedding
   │         LIMIT 5
   └─ Return ranked documents: [doc1, doc2, ...]

4. Build system prompt with retrieved context:
   └─ "User knowledge base: {doc1.content} {doc2.content} ..."

5. Call Claudible with system + user messages

6. Return response with product context
```

**Services Used:** RAGService, EmbeddingsService, Supabase

## Multi-Tenant Architecture

### Isolation Strategy

**Header-Based Routing:**
```typescript
// All API requests include X-Tenant-ID header
// Middleware validates presence and sets context

middleware: (c, next) => {
  const tenantId = c.get('tenantId');
  c.set('tenantId', tenantId);  // Available to handlers
  await next();
}
```

**Database-Level Filtering:**
```typescript
// Every query includes WHERE tenant_id = ?
// Prevents accidental cross-tenant data access

const docs = await supabase
  .from('documents')
  .select('*')
  .eq('tenant_id', tenantId);  // ← Required filter
```

**Configuration Isolation:**
```typescript
// Each tenant has own settings stored in DB

tenantConfig {
  id: "tenant-1",
  shopifyDomain: "store1.myshopify.com",
  shopifyCredentials: { ... },
  widgetSettings: {
    primaryColor: "#FF6B35",
    position: "bottom-right",
    greeting: "Hi! How can we help?"
  },
  ragConfig: {
    enabled: true,
    collectionName: "store-1-docs",
    maxResults: 3,
    similarityThreshold: 0.75
  }
}
```

**Shopify Credentials Storage:**
```typescript
// Store per-tenant Shopify access tokens
// Admin token (server-side) + Storefront token (public)

ShopifyFactory.createAdminClient(tenantId)
  ├─ Load admin token from tenantConfig
  ├─ Initialize GraphQL client
  └─ Execute privileged operations

ShopifyFactory.createStorefrontClient(tenantId)
  ├─ Load public token
  ├─ Initialize Storefront API
  └─ Safe for client-side operations
```

## Integration Points

### 1. Shopify Integration

**Admin API (Server-side):**
- Product catalog management
- Order creation/updates
- Inventory management
- Store settings

**Storefront API (Public):**
- Product search and filtering
- Cart operations
- Checkout operations
- Recommendations

**Authentication:** Per-tenant access tokens stored in TenantConfig

### 2. Voyage AI Integration

**Embeddings Endpoint:**
```
POST https://api.voyageai.com/v1/embeddings
{
  "model": "voyage-3-lite",
  "input": "your text here",
  "input_type": "document"  // or "query" for searches
}
→ { data: [{ embedding: [0.123, -0.456, ...] }] }
```

**Usage:** Document indexing and similarity search
**Free Tier:** 50M tokens/month with voyage-3-lite

### 3. Claudible API

**Chat Endpoint:**
```
POST https://api.claudible.com/v1/messages
{
  "model": "claude-3-5-sonnet",
  "messages": [{ role, content }, ...],
  "system": "You are...",
  "tools": [{ name, description, input_schema }, ...]
}
```

**Response Streaming:** SSE for real-time token delivery

### 4. Cloudflare Services

**Workers:** API hosting with 30-second timeout
**Pages:** Widget static hosting with CDN
**KV:** Optional session storage (not currently used)

## Deployment Architecture

### Development Environment

```
Local Machine
├─ npm run dev → Hono dev server (localhost:8787)
└─ cd widget && npm run dev → Vite dev server (localhost:5173)

Environment Variables: .env file (local only)
```

### Production Environment

```
┌─────────────────────────────────────────┐
│   Cloudflare Workers (API)              │
│   - Global edge deployment              │
│   - Auto-scaling                        │
│   - Secrets via wrangler secret put      │
│   - Monitoring via CF Dashboard         │
└─────────────────────────────────────────┘

┌─────────────────────────────────────────┐
│   Cloudflare Pages (Widget)             │
│   - Static hosting + CDN                │
│   - VITE_API_URL env variable           │
│   - Auto-deploy from Git                │
│   - SSL/TLS included                    │
└─────────────────────────────────────────┘

┌─────────────────────────────────────────┐
│   Supabase (Database)                   │
│   - PostgreSQL with pgvector            │
│   - Managed backups                     │
│   - Connection pooling                  │
│   - Row-level security (optional)       │
└─────────────────────────────────────────┘
```

## Performance Considerations

### Caching Strategies

1. **Tenant Config Caching**
   - Cache in Workers memory (reused across requests)
   - TTL: Session lifetime (per request)
   - Invalidate: On config update

2. **Document Embeddings**
   - Computed once during indexing
   - Stored in Supabase pgvector
   - Indexed with ivfflat for O(1) search

3. **Static Assets**
   - Widget via Cloudflare Pages CDN
   - Cache-Control: 1 year (immutable)
   - Content-addressed (hash in filename)

### Database Query Optimization

- Use vector index for similarity search
- Filter by tenant_id in WHERE clause
- Select only required columns
- Use LIMIT to reduce result set

### Rate Limiting (Optional)

Could use Cloudflare KV:
```typescript
// Rate limit: 100 requests/min per IP
const key = `rate:${clientIp}`;
const count = await RATE_LIMIT.get(key);
if (count > 100) return 429 Too Many Requests;
```

---

**Last Updated:** February 15, 2026
**Architecture Version:** 1.0
