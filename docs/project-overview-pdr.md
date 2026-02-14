# Smart Chat Bot - Project Overview & PDR

## Project Overview

Smart Chat Bot is a multi-tenant AI chatbot platform with Retrieval-Augmented Generation (RAG) capabilities, designed for Shopify dropshipping stores. The system enables shop owners to deploy AI-powered customer support agents that understand their product catalog and can assist with product recommendations, cart management, and customer inquiries.

**Version:** 1.0.0
**License:** MIT
**Repository:** Smart Chat Bot

### Target Users

1. **Shopify Store Owners** - Business owners running dropshipping operations
2. **E-commerce Managers** - Responsible for customer support automation
3. **Support Teams** - Users managing chat interactions and customer data

## Product Goals

| Goal | Description | Success Metric |
|------|-------------|-----------------|
| **Customer Support Automation** | Reduce manual support workload through AI | 70% of support queries handled automatically |
| **Sales Enablement** | Recommend products and assist checkout | 20% increase in cart conversion |
| **Multi-tenant Isolation** | Support multiple independent stores securely | Zero data leakage between tenants |
| **Easy Integration** | Embed widget on any Shopify store | Setup in <5 minutes, no code required |

## Key Features

### 1. Chat Intelligence
- Multi-message conversation context
- Configurable system prompts per tenant
- SSE streaming for real-time responses
- Non-streaming sync mode for testing

### 2. Retrieval-Augmented Generation (RAG)
- Vector embeddings using OpenAI
- Pgvector storage in Supabase
- Similarity-based document retrieval
- Configurable similarity thresholds

### 3. Agent-Based Automation
- Tool-based agent with function calling
- Product search and recommendations
- Cart management and checkout assistance
- Integration with Shopify APIs

### 4. Shopify Integration
- Product catalog synchronization
- Cart and checkout operations
- Storefront and Admin API support
- Multi-store configuration

### 5. Preact Widget
- Lightweight embeddable chat interface
- Customizable colors, positioning, messaging
- SSE event streaming for real-time updates
- Mobile-responsive design

### 6. Multi-Tenant Architecture
- Tenant isolation via X-Tenant-ID header
- Per-tenant configuration (colors, prompts, settings)
- Database separation via tenant_id foreign keys
- Secure credential management

## Technical Architecture

### Tech Stack

| Component | Technology | Rationale |
|-----------|-----------|-----------|
| **Backend** | Hono + Cloudflare Workers | Serverless, global edge deployment, low latency |
| **Frontend Widget** | Preact + Vite | Lightweight (8KB gzip), fast build |
| **Database** | Supabase (PostgreSQL + pgvector) | Managed PostgreSQL, native vector support |
| **AI/Embeddings** | OpenAI API + Claudible | GPT models for chat, embedding generation |
| **Hosting** | Cloudflare Workers + Pages | Serverless scaling, CDN for widget |

### System Components

```
┌─────────────────────────────────────────────────────────┐
│                    Shopify Store                        │
├─────────────────────────────────────────────────────────┤
│ HTML/CSS/JS                                             │
│ <script src="https://cdn.../embed.js"></script>         │
└──────────────┬──────────────────────────────────────────┘
               │ Embed
┌──────────────▼──────────────────────────────────────────┐
│        Preact Chat Widget (Cloudflare Pages)            │
│  - UI Components                                        │
│  - Session Management                                   │
│  - SSE Event Stream Listener                            │
└──────────────┬──────────────────────────────────────────┘
               │ HTTP/SSE
┌──────────────▼──────────────────────────────────────────┐
│     Hono API (Cloudflare Workers)                       │
│  - /api/chat - Basic chat (Claudible streaming)         │
│  - /api/chat/sync - Sync response mode                  │
│  - /api/chat/agent - Agent with tool calling            │
│  - /api/chat/agent/stream - Agent SSE streaming         │
│  - /health - Health check                               │
└──────────────┬──────────────────────────────────────────┘
               │ REST API
┌──────────────▼──────────────────────────────────────────┐
│           Backend Services                              │
│  - ChatAgent (AI orchestration)                          │
│  - RAGService (Vector search)                           │
│  - EmbeddingsService (OpenAI)                           │
│  - ShopifyFactory (Store integration)                   │
│  - TenantService (Config management)                    │
└──────────────┬──────────────────────────────────────────┘
               │ SQL/REST
┌──────────────▼──────────────────────────────────────────┐
│  External Services & Databases                          │
│  - Supabase/PostgreSQL (pgvector)                       │
│  - Shopify Admin API                                    │
│  - Shopify Storefront API                               │
│  - OpenAI API                                           │
│  - Claudible API                                        │
└─────────────────────────────────────────────────────────┘
```

## Functional Requirements

### FR-1: Chat & Conversation Management
- Accept multi-turn conversations with message history
- Support user and assistant message roles
- Store sessions in Cloudflare KV
- Expire inactive sessions after 24 hours

### FR-2: Retrieval-Augmented Generation
- Index documents as vector embeddings
- Retrieve similar documents for context window
- Configurable per-tenant RAG settings
- Similarity threshold filtering

### FR-3: Agent & Tool Calling
- Define callable tools with schemas
- Execute tools based on agent decisions
- Handle tool results in conversation
- Return structured tool execution logs

### FR-4: Multi-Tenant Support
- Isolate data by tenant_id
- Enforce authorization via X-Tenant-ID header
- Support per-tenant configuration
- Prevent cross-tenant data access

### FR-5: Shopify Integration
- Fetch product catalog
- Search products by name/tags
- Manage shopping carts
- Process checkout flows

## Non-Functional Requirements

### NFR-1: Performance
- **API Response Time:** <500ms for chat responses (p95)
- **Widget Load Time:** <2s full load including SSE connection
- **Database Query Time:** <100ms for vector similarity search
- **Throughput:** Support 1,000+ concurrent users per tenant

### NFR-2: Reliability
- **Availability:** 99.5% uptime
- **Error Recovery:** Graceful fallback when external services fail
- **Session Persistence:** Retain chat history for 30 days
- **Data Durability:** No message loss on service restart

### NFR-3: Security
- **Data Isolation:** Zero cross-tenant data exposure
- **Encryption:** TLS 1.3 for all transport
- **Secrets:** No hardcoded credentials, use Cloudflare secrets
- **CORS:** Restrict widget embedding to authorized domains
- **Rate Limiting:** 100 requests/minute per IP (optional)

### NFR-4: Scalability
- **Serverless Auto-scaling:** Handle traffic spikes without provisioning
- **Database Connections:** Connection pooling via Supabase
- **Vector Index:** Pgvector indexes for O(log n) search
- **Widget CDN:** Global distribution via Cloudflare Pages

### NFR-5: Maintainability
- **Type Safety:** 100% TypeScript with strict mode
- **Documentation:** Inline comments for complex logic
- **Testing:** Unit tests for services and utilities
- **Code Review:** All changes reviewed before merge

## Success Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| **User Activation** | >80% of installs active after 30 days | Supabase analytics |
| **Query Response Time** | <500ms p95 | Cloudflare Workers analytics |
| **RAG Accuracy** | >85% relevant documents in top 3 results | Manual evaluation |
| **Uptime** | 99.5% | Cloudflare monitoring |
| **Support Load Reduction** | 30-50% fewer manual responses | Store owner reporting |
| **Widget Performance** | Lighthouse score >90 | Automated testing |

## Development Phases

1. **Phase 1:** Setup & Environment - Project initialization, tooling
2. **Phase 2:** Backend API - Hono routes, middleware, error handling
3. **Phase 3:** Database & RAG - Supabase schema, pgvector, embeddings
4. **Phase 4:** Shopify Integration - Admin/Storefront API clients
5. **Phase 5:** Chat Widget - Preact components, SSE streaming
6. **Phase 6:** AI Agent Logic - Tool definitions, agent orchestration
7. **Phase 7:** Testing & Deployment - Unit/integration tests, CI/CD

## Dependencies & Constraints

### External Dependencies
- **Supabase:** PostgreSQL with pgvector extension
- **OpenAI API:** For embeddings and (optionally) chat
- **Claudible API:** For extended AI features
- **Shopify APIs:** Admin and Storefront APIs

### Technical Constraints
- **Cloudflare Workers:** 30-second timeout per request
- **Pgvector Dimensions:** 1536 dimensions (OpenAI embedding size)
- **Widget Payload:** <100KB gzipped for fast load
- **TypeScript Target:** ES2022 (modern browsers only)

### Assumptions
- Shopify stores have Admin API access token available
- Document corpus is pre-indexed or indexed during setup
- OpenAI API availability/cost is acceptable
- Tenant configuration is manually set via admin dashboard (future)

## Stakeholders

| Role | Responsibility |
|------|-----------------|
| **Product Manager** | Define roadmap, prioritize features |
| **Backend Developer** | Implement API, database, agent logic |
| **Frontend Developer** | Build and maintain Preact widget |
| **DevOps/Infra** | Deploy, monitor, scale infrastructure |
| **QA** | Test functionality, performance, security |

---

**Last Updated:** February 15, 2026
**Status:** Active Development
