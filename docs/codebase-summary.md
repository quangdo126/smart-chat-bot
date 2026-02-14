# Smart Chat Bot - Codebase Summary

## Project Structure

```
smart-chat-bot/
├── src/                      # Backend API (Cloudflare Workers)
│   ├── index.ts              # Main Hono app, middleware, routes
│   ├── types/
│   │   └── index.ts          # TypeScript interfaces (Env, ChatMessage, etc)
│   ├── config/
│   │   ├── env.ts            # Environment variable types
│   │   └── system-prompts.ts # AI system prompt templates
│   ├── routes/
│   │   ├── chat-routes.ts    # Chat endpoints (/api/chat/*)
│   │   └── health-routes.ts  # Health check endpoints
│   ├── services/
│   │   ├── chat-agent.ts     # AI agent orchestration, tool calling
│   │   ├── agent-tools.ts    # Tool definitions (search, cart, etc)
│   │   ├── claudible-client.ts  # Claudible API wrapper
│   │   ├── embeddings-service.ts # Voyage AI embeddings
│   │   ├── rag-service.ts    # Vector search, document retrieval
│   │   ├── tenant-service.ts # Tenant config, multi-tenancy
│   │   ├── shopify-factory.ts   # Factory for Shopify clients
│   │   ├── shopify-admin-client.ts  # Shopify Admin API
│   │   └── shopify-storefront-client.ts # Shopify Storefront API
│   └── db/
│       ├── supabase-client.ts # Supabase PostgreSQL client
│       └── schema.sql         # Database schema (tables, vectors)
│
├── widget/                    # Frontend Chat Widget (Preact)
│   ├── src/
│   │   ├── main.tsx          # App entrypoint
│   │   ├── app.tsx           # Root Preact component
│   │   ├── components/
│   │   │   ├── chat-bubble.tsx    # Chat bubble UI
│   │   │   ├── chat-messages.tsx  # Message list
│   │   │   ├── chat-input.tsx     # User input area
│   │   │   ├── product-card.tsx   # Product display
│   │   │   └── cart-button.tsx    # Cart action button
│   │   ├── hooks/
│   │   │   ├── use-chat.ts   # Chat state management
│   │   │   └── use-sse.ts    # Server-sent events streaming
│   │   ├── types.ts          # Widget TypeScript types
│   │   ├── styles.css        # Widget styling
│   │   └── embed.js          # Embed script for website
│   ├── public/               # Static assets
│   ├── package.json          # Widget dependencies
│   ├── vite.config.ts        # Vite build config
│   ├── tsconfig.json         # TypeScript config
│   └── index.html            # Widget HTML entry
│
├── docs/                      # Documentation
│   ├── project-overview-pdr.md   # Product requirements
│   ├── codebase-summary.md       # This file
│   ├── code-standards.md         # Coding conventions
│   ├── system-architecture.md    # Architecture details
│   └── deployment-guide.md       # Deploy instructions
│
├── plans/                     # Development plans (existing)
│   └── 260215-0133-smart-chatbot-rag/
│       ├── phase-*.md         # Phase implementation guides
│       └── plan.md            # Master plan
│
├── .env.example               # Environment variables template
├── .gitignore                 # Git ignore patterns
├── package.json               # Root dependencies
├── package-lock.json          # Lock file
├── tsconfig.json              # TypeScript root config
├── wrangler.toml              # Cloudflare Workers config
└── repomix-output.xml         # Codebase snapshot (auto-generated)
```

## Key Files & Purposes

### Backend (src/)

**index.ts** - Hono Application Entry
- Sets up Hono app with type-safe environment/context
- Configures CORS middleware (allows all origins for widget embedding)
- Extracts X-Tenant-ID header for multi-tenancy
- Mounts chat and health routes
- Handles 404 and global error responses

**types/index.ts** - Type Definitions
- `Env` - Cloudflare Workers bindings (CHAT_SESSIONS KV, secrets)
- `ChatMessage` - Individual message with role, content, metadata
- `ChatSession` - Session with message history
- `TenantConfig` - Multi-tenant settings (colors, RAG config)
- `ShopifyCredentials` - Store admin/storefront tokens
- `ApiResponse<T>` - Standard API response wrapper
- `ContextVariables` - Hono context type definitions

**routes/chat-routes.ts** - Chat API Endpoints
- `POST /api/chat` - Streaming chat with Claudible (SSE)
- `POST /api/chat/sync` - Non-streaming response (for testing)
- `POST /api/chat/agent` - Agent mode with tool calling (returns full response)
- `POST /api/chat/agent/stream` - Agent mode with SSE streaming

**services/chat-agent.ts** - Agent Orchestration
- `ChatAgent` class manages multi-turn conversations
- `processMessage()` - Synchronous agent execution with tool calling
- `processMessageStream()` - Async generator for streaming events
- Tool definitions: search_products, get_cart, update_cart, add_to_cart
- Returns structured tool results and final message

**services/claudible-client.ts** - AI Client
- Wrapper around Claudible API (external AI service)
- `chatStream()` - Streaming text response generator
- `chatRaw()` - Full response with usage metrics
- Message format: { role, content }

**services/embeddings-service.ts** - Vector Embeddings
- Creates document embeddings using Voyage AI API
- Generates 1024-dimensional vectors (voyage-3-lite)
- Supports batch embedding operations
- Uses input_type: 'query' for searches, 'document' for indexing

**services/rag-service.ts** - Retrieval-Augmented Generation
- Vector similarity search in Supabase pgvector
- `searchDocuments()` - Find related documents by embedding
- Configurable similarity thresholds per tenant
- Returns ranked results with similarity scores

**services/tenant-service.ts** - Multi-Tenancy
- Loads tenant configuration from database
- Manages per-tenant RAG, widget, Shopify settings
- Validates tenant authorization

**services/shopify-*.ts** - Shopify Integration
- `ShopifyFactory` - Creates client based on API type
- `ShopifyAdminClient` - Products, inventory, orders (server-side)
- `ShopifyStorefrontClient` - Public API access (client-side)
- Query builders for GraphQL operations

**db/supabase-client.ts** - Database Connection
- Creates Supabase client from URL + service role key
- Provides SQL query interface
- Handles authentication for server-to-server calls

**db/schema.sql** - Database Schema
- `tenants` table - Store configurations
- `documents` table - RAG corpus with embeddings
- `chat_sessions` table - Message history
- `chat_messages` table - Individual messages
- pgvector indexes for fast similarity search

### Frontend (widget/)

**src/app.tsx** - Main Widget Component
- Root Preact component
- Initializes SSE connection to API
- Manages global chat state
- Renders chat bubble, messages, input

**src/components/chat-bubble.tsx** - Chat UI
- Floating chat bubble widget
- Open/close toggle
- Customizable colors, position (bottom-right/left)

**src/components/chat-messages.tsx** - Message Display
- Renders message list
- Auto-scroll to latest
- Handles text and product card rendering

**src/components/product-card.tsx** - Product Display
- Shows product image, name, price
- "Add to Cart" button
- Rendered when agent returns product tools

**src/hooks/use-sse.ts** - Server-Sent Events
- Connects to SSE stream
- Parses events (message, tool_call, tool_result, done)
- Reconnection logic

**src/hooks/use-chat.ts** - Chat State
- Manages messages, loading state
- Sends messages to API
- Handles tool execution responses

**src/main.tsx** - Widget Initialization
- Preact app entry point
- Mounts to DOM or creates container

**widget/public/embed.js** - Installation Script
- Injected into Shopify store HTML
- Creates widget iframe
- Configures API URL and tenant ID

## API Endpoints

### Chat Endpoints

| Method | Path | Purpose | Streaming |
|--------|------|---------|-----------|
| POST | `/api/chat` | Stream chat response (Claudible) | SSE |
| POST | `/api/chat/sync` | Get full response at once | No |
| POST | `/api/chat/agent` | Agent with tools (full response) | No |
| POST | `/api/chat/agent/stream` | Agent with tools (streaming) | SSE |

### Health Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/health` | Service health check |
| GET | `/` | API info (name, version) |

### Request Headers

All `/api/*` routes require:
- `X-Tenant-ID: {tenantId}` - Multi-tenant identifier (required)
- `Content-Type: application/json` - Request body format

### Request Bodies

**Chat Request** (POST /api/chat, /api/chat/sync)
```json
{
  "messages": [
    { "role": "user", "content": "..." },
    { "role": "assistant", "content": "..." }
  ],
  "systemPrompt": "Optional custom system prompt",
  "sessionId": "Optional session UUID"
}
```

**Agent Request** (POST /api/chat/agent, /api/chat/agent/stream)
```json
{
  "messages": [{ "role": "user", "content": "..." }],
  "sessionId": "UUID (required for agent)",
  "cartId": "Optional Shopify cart ID"
}
```

### Response Format

All responses wrapped in `ApiResponse<T>`:
```json
{
  "success": true,
  "data": { "reply": "..." },
  "timestamp": "2026-02-15T12:00:00Z"
}
```

Error response:
```json
{
  "success": false,
  "error": "Error description",
  "timestamp": "2026-02-15T12:00:00Z"
}
```

## Data Flow Diagram

```
User Input
    │
    ▼
[Chat Widget - Preact]
    │ SSE Connection
    ▼
[Hono API - Cloudflare Workers]
    │ X-Tenant-ID Header
    ├─► [TenantService] ◄─ Fetch config
    │        │
    │        ▼
    │   [Supabase] ◄─ tenants table
    │
    ├─► [ChatAgent] ◄─ Agent logic
    │        │
    │        ├─► [Claudible API] ◄─ AI response
    │        │
    │        ├─► [RAGService] ◄─ Vector search
    │        │        │
    │        │        ▼
    │        │   [Supabase pgvector] ◄─ documents table
    │        │
    │        └─► [Agent Tools] ◄─ Execute tools
    │               │
    │               ├─► [ShopifyAdminClient]
    │               │        │
    │               │        ▼
    │               │   [Shopify Admin API]
    │               │
    │               └─► [EmbeddingsService]
    │                        │
    │                        ▼
    │                   [Voyage AI API]
    │
    └──► [Response Stream]
            │ SSE Events
            ▼
        [Widget UI]
        [Display Response]
```

## Technology Dependencies

### Runtime (Cloudflare Workers)
- **hono** (^4.7.0) - Web framework
- **@supabase/supabase-js** (^2.50.0) - Database client
- **@cloudflare/workers-types** (^4.20260210.0) - Type definitions

### Build Tools
- **wrangler** (^4.6.0) - Cloudflare Workers CLI
- **typescript** (^5.7.0) - Language compiler

### Widget (Preact)
- **preact** - UI framework
- **vite** - Build tool

## Environment Variables

Required secrets (set via `wrangler secret put`):
- `SUPABASE_URL` - PostgreSQL endpoint
- `SUPABASE_SERVICE_ROLE_KEY` - DB authentication
- `VOYAGE_API_KEY` - Embeddings API (Voyage AI)
- `CLAUDIBLE_API_KEY` (optional) - Enhanced AI features

## Testing & Quality

**Type Safety:** TypeScript strict mode enabled
```bash
npm run typecheck  # Verify types without building
npm run build      # Compile to JavaScript
```

**No automated tests configured yet** - Tests are in development phase

## Build & Deployment

```bash
# Development
npm run dev              # Local development server

# Building
npm run build            # Compile TypeScript
npm run typecheck        # Type checking only

# Deployment
npm run deploy:api       # Deploy Workers to production
npm run deploy:widget    # Deploy widget to Pages
npm run deploy:all       # Deploy both
```

See `deployment-guide.md` for detailed deployment instructions.

---

**Last Updated:** February 15, 2026
**Codebase Size:** ~275KB (69K tokens)
