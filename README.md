# Smart Chat Bot

A multi-tenant AI chatbot platform with Retrieval-Augmented Generation (RAG) capabilities for Shopify dropshipping stores.

## What Is Smart Chat Bot?

Smart Chat Bot enables e-commerce store owners to deploy AI-powered customer support agents that understand their product catalog. The system:

- Answers customer questions using your product knowledge base (RAG)
- Recommends products based on customer needs
- Assists with shopping cart operations
- Integrates seamlessly into any Shopify store via embeddable widget
- Scales globally using Cloudflare infrastructure

**Key Technologies:** Hono + Cloudflare Workers + Supabase pgvector + Preact

## Quick Start

### Prerequisites

- **Node.js 18+** - Development runtime
- **npm 10+** - Package manager
- **Cloudflare Account** - Free account works for development
- **Supabase Project** - Free tier available at supabase.com
- **Voyage AI API Key** - For embeddings (voyage-3-lite model, free tier available)

### 1. Clone & Install

```bash
# Clone repository
git clone <repo-url>
cd smart-chat-bot

# Install dependencies
npm install

# Install widget dependencies
cd widget && npm install && cd ..
```

### 2. Setup Environment

```bash
# Copy environment template
cp .env.example .env

# Edit .env with your values
# Required:
#   SUPABASE_URL=https://your-project.supabase.co
#   SUPABASE_SERVICE_ROLE_KEY=your-service-key
#   VOYAGE_API_KEY=pa-your-key
#   CLAUDIBLE_API_KEY=your-claudible-key (optional)
```

### 3. Login to Cloudflare

```bash
npm run typecheck   # Verify types
npm run dev         # Start local dev server
# Server runs at http://localhost:8787
```

### 4. Setup Database

Create tables in Supabase using the schema from `src/db/schema.sql`:

```bash
# Connect to your Supabase database and run:
# psql postgresql://user:password@db.supabase.co:5432/postgres

# Then paste contents of src/db/schema.sql
```

### 5. Test the API

```bash
# Start dev server (if not already running)
npm run dev

# Test basic chat endpoint
curl -X POST http://localhost:8787/api/chat \
  -H "Content-Type: application/json" \
  -H "X-Tenant-ID: test-tenant" \
  -d '{
    "messages": [
      { "role": "user", "content": "Hello!" }
    ]
  }'
```

### 6. Deploy

See [Deployment Guide](./docs/deployment-guide.md) for production deployment instructions.

## Project Structure

```
src/                    # Backend API
├── index.ts           # Hono app entry point
├── routes/            # API endpoints
├── services/          # Business logic
├── db/                # Database layer
├── config/            # Configuration
└── types/             # TypeScript types

widget/               # Preact chat widget
├── src/              # Widget source
├── dist/             # Built widget
└── public/           # Static assets

docs/                 # Documentation
├── project-overview-pdr.md      # Product requirements
├── codebase-summary.md          # Code overview
├── code-standards.md            # Coding guidelines
├── system-architecture.md       # Architecture docs
└── deployment-guide.md          # Deploy instructions
```

## Documentation

Start with these docs based on your role:

| Role | Start Here | Then Read |
|------|-----------|-----------|
| **Product Manager** | [Project Overview](./docs/project-overview-pdr.md) | [System Architecture](./docs/system-architecture.md) |
| **Backend Developer** | [Codebase Summary](./docs/codebase-summary.md) | [Code Standards](./docs/code-standards.md), [System Architecture](./docs/system-architecture.md) |
| **Frontend Developer** | [Codebase Summary](./docs/codebase-summary.md) | [Code Standards](./docs/code-standards.md) |
| **DevOps/Infra** | [Deployment Guide](./docs/deployment-guide.md) | [System Architecture](./docs/system-architecture.md) |

## API Endpoints

### Chat Endpoints

**POST /api/chat** - Streaming chat response
```bash
curl -X POST http://localhost:8787/api/chat \
  -H "X-Tenant-ID: tenant-123" \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [
      { "role": "user", "content": "Do you have blue shoes?" }
    ]
  }'
```

**POST /api/chat/sync** - Synchronous response (for testing)
```bash
curl -X POST http://localhost:8787/api/chat/sync \
  -H "X-Tenant-ID: tenant-123" \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [
      { "role": "user", "content": "Do you have blue shoes?" }
    ]
  }'

# Response:
# { "success": true, "data": { "reply": "..." } }
```

**POST /api/chat/agent** - Agent with tool calling
```bash
curl -X POST http://localhost:8787/api/chat/agent \
  -H "X-Tenant-ID: tenant-123" \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [{ "role": "user", "content": "Find blue shoes" }],
    "sessionId": "session-uuid"
  }'
```

**POST /api/chat/agent/stream** - Agent with streaming
Streams tool execution progress in real-time via Server-Sent Events.

### Health Endpoints

**GET /health** - Service health check
```bash
curl http://localhost:8787/health
```

**GET /** - API info
```bash
curl http://localhost:8787/
# { "success": true, "data": { "name": "Smart Chat Bot API", "version": "1.0.0" } }
```

All endpoints require `X-Tenant-ID` header for multi-tenant isolation.

## Core Features

### 1. Multi-Tenant Isolation
Each shop owner gets complete data isolation. Tenant ID required in request header.

### 2. Retrieval-Augmented Generation (RAG)
Documents are converted to vector embeddings and stored in Supabase with pgvector. When a user asks a question, relevant documents are retrieved to provide context to the AI.

### 3. Agent with Tool Calling
The AI can use tools (functions) to:
- Search your product catalog
- Manage shopping carts
- Process checkouts
- Query store information

### 4. Streaming Responses
SSE (Server-Sent Events) for real-time chat with visible "typing" indicators.

### 5. Shopify Integration
Connects to Shopify Admin and Storefront APIs to access products and carts.

### 6. Embeddable Widget
Lightweight Preact widget (<100KB) that embeds on any website.

## Development Commands

```bash
# Development
npm run dev               # Start local dev server
npm run typecheck        # Check TypeScript without building
npm run build            # Compile TypeScript to JavaScript

# Widget development
cd widget && npm run dev # Start widget dev server

# Deployment
npm run deploy:api              # Deploy API to production
npm run deploy:widget           # Deploy widget to production
npm run deploy:all              # Deploy both

# Secrets management
npm run secrets:set      # Instructions for setting secrets
```

## Configuration

### Environment Variables

Required:
- `SUPABASE_URL` - Your Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY` - Service role key for backend queries
- `VOYAGE_API_KEY` - For generating embeddings (Voyage AI)
- `CLAUDIBLE_API_KEY` - For AI chat responses

See `.env.example` for all options.

### Tenant Configuration

Per-tenant settings stored in database:

```json
{
  "id": "tenant-1",
  "name": "My Store",
  "shopifyDomain": "mystore.myshopify.com",
  "shopifyCredentials": {
    "adminToken": "...",
    "storefrontToken": "..."
  },
  "widgetSettings": {
    "primaryColor": "#FF6B35",
    "position": "bottom-right",
    "greeting": "Hi! Can we help?",
    "placeholder": "Type your question..."
  },
  "ragConfig": {
    "enabled": true,
    "collectionName": "my-store-docs",
    "maxResults": 3,
    "similarityThreshold": 0.75
  }
}
```

## Architecture Overview

```
Shopify Store (HTML)
        ↓ embed script
Preact Widget (Cloudflare Pages)
        ↓ HTTP + SSE
Hono API (Cloudflare Workers)
        ├─ ChatAgent
        ├─ RAGService
        ├─ ShopifyClients
        └─ EmbeddingsService
        ↓ SQL + REST API
Supabase PostgreSQL + pgvector
Voyage AI API
Claudible API
Shopify APIs
```

See [System Architecture](./docs/system-architecture.md) for detailed diagrams and data flows.

## Deployment

### Quick Deploy to Production

```bash
# 1. Login to Cloudflare
npm run typecheck      # Verify no type errors
npm run build          # Compile code

# 2. Set production secrets
wrangler secret put SUPABASE_URL --env production
wrangler secret put SUPABASE_SERVICE_ROLE_KEY --env production
wrangler secret put VOYAGE_API_KEY --env production
wrangler secret put CLAUDIBLE_API_KEY --env production

# 3. Deploy
npm run deploy:api:production
npm run deploy:widget:production

# Or deploy both at once:
npm run deploy:all
```

For detailed instructions, see [Deployment Guide](./docs/deployment-guide.md).

## Performance

- **API Response Time:** <500ms (p95)
- **Widget Load Time:** <2 seconds
- **Vector Search:** <100ms (with pgvector indexes)
- **Global Deployment:** Cloudflare edge locations worldwide

## Security

- Type-safe TypeScript prevents common vulnerabilities
- Multi-tenant data isolation at database level
- Secrets stored securely in Cloudflare (never in code)
- CORS configured for widget embedding
- No sensitive data in logs

See [System Architecture](./docs/system-architecture.md) for security details.

## Troubleshooting

### Dev Server Won't Start
```bash
# Clear cache and reinstall
rm -rf node_modules dist
npm install
npm run dev
```

### Database Connection Error
```bash
# Verify credentials in .env
echo $SUPABASE_URL
echo $SUPABASE_SERVICE_ROLE_KEY

# Test connection
npm run typecheck
```

### Widget Not Loading
```bash
# Check VITE_API_URL is set correctly in Cloudflare Pages
# Verify X-Tenant-ID header is being sent
# Check CORS configuration in API
```

See [Deployment Guide](./docs/deployment-guide.md#troubleshooting) for more.

## Contributing

1. Follow [Code Standards](./docs/code-standards.md)
2. Run type check: `npm run typecheck`
3. Build before commit: `npm run build`
4. Use conventional commits: `feat:`, `fix:`, `docs:`, etc

## Technology Stack

| Component | Technology | Why |
|-----------|-----------|-----|
| **Backend** | Hono + Cloudflare Workers | Global serverless, low latency, scales automatically |
| **Widget** | Preact + Vite | Lightweight, fast, embeddable |
| **Database** | Supabase (PostgreSQL + pgvector) | Managed PostgreSQL, native vector support |
| **AI** | Voyage AI + Claudible | State-of-the-art models |
| **Hosting** | Cloudflare Workers + Pages | Global edge deployment, CDN |

## License

MIT

## Support

- Documentation: See `docs/` folder
- Issues: GitHub Issues
- Roadmap: See [Project Overview](./docs/project-overview-pdr.md)

---

**Version:** 1.0.0
**Last Updated:** February 15, 2026
