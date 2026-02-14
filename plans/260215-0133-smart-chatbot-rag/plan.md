---
title: "Smart Chat Bot with RAG for Shopify Dropshipping"
description: "Multi-tenant AI chatbot using Claude Haiku 4.5 via Claudible API with RAG for automated sales"
status: pending
priority: P1
effort: 36h
branch: main
tags: [chatbot, rag, shopify, cloudflare-workers, supabase, multi-tenant, iframe]
created: 2026-02-15
---

# Smart Chat Bot with RAG - Implementation Plan

## Overview

Multi-tenant AI-powered sales chatbot with:
- **Multi-tenant**: Up to 15 shops, namespace partitioning, RLS isolation
- **RAG**: 2000+ products per tenant, FAQs, order info via pgvector
- **Actions**: Product search, cart operations, draft order creation
- **Streaming**: SSE via Hono on Cloudflare Workers
- **Widget**: Universal iframe embed (works on ANY website)

## Architecture

```
[Any Website (Next.js / WordPress / Shopify / etc)]
    ↓ embed script tag
[<script src="widget.example.com/chat.js" data-tenant="shop-abc">]
    ↓ creates iframe
[Iframe → Cloudflare Pages (Widget React App)]
    ↓ API calls with X-Tenant-ID header
[Cloudflare Workers (Hono API)]
    ├── SSE Streaming
    ├── Claudible API (Claude Haiku 4.5)
    └── Supabase (PostgreSQL + pgvector + RLS)
         ↓ RLS auto-filters by tenant
[Tenant Config → Shopify APIs per tenant]
    ├── Storefront API (products, cart, checkout)
    └── Admin API (draft orders)
```

## Multi-tenant Design

| Aspect | Implementation |
|--------|----------------|
| Isolation | Row Level Security (RLS) per tenant |
| Identification | `tenant_id` column on all tables |
| Widget Auth | `data-tenant` attribute → X-Tenant-ID header |
| Config Storage | `tenants` table with Shopify credentials |
| Max Tenants | 15 shops (Supabase free tier) |

## Tech Stack

| Layer | Technology |
|-------|------------|
| Backend | Hono on Cloudflare Workers |
| Widget Host | Cloudflare Pages (iframe) |
| Embed Script | Vanilla JS (~2KB) |
| Database | Supabase PostgreSQL + pgvector + RLS |
| Embeddings | OpenAI text-embedding-3-small |
| LLM | Claude Haiku 4.5 via Claudible |
| Shopify | Storefront API + Admin API (per tenant) |

## Phase Summary

| Phase | Description | Effort | Status |
|-------|-------------|--------|--------|
| [Phase 1](phase-01-setup-environment.md) | Project structure, deps, env config | 3h | pending |
| [Phase 2](phase-02-backend-api.md) | Hono API with Claudible, SSE streaming | 5h | pending |
| [Phase 3](phase-03-database-rag.md) | Multi-tenant Supabase, pgvector, RLS, embedding pipeline | 8h | pending |
| [Phase 4](phase-04-shopify-integration.md) | Per-tenant Storefront/Admin API, external site checkout | 6h | pending |
| [Phase 5](phase-05-chat-widget.md) | Universal iframe widget on Cloudflare Pages | 6h | pending |
| [Phase 6](phase-06-ai-agent-logic.md) | Per-tenant system prompts, tool calling, conversation flow | 5h | pending |
| [Phase 7](phase-07-testing-deployment.md) | Tests, Cloudflare deployment, widget embed testing | 3h | pending |

## Key Dependencies

- Claudible API key for Claude Haiku 4.5 access
- Supabase project with pgvector extension
- OpenAI API key for embeddings
- Shopify Partner account (for each tenant's store)
- Cloudflare account for Workers + Pages deployment

## Critical Decisions Made

1. **Multi-tenant with RLS**: Single database, namespace isolation via tenant_id + RLS
2. **Universal Iframe Widget**: Works on ANY website (Next.js, WordPress, Shopify, etc)
3. **pgvector over Qdrant**: Already using Supabase, no chunking needed for products
4. **SSE over WebSocket**: Simpler, better firewall support, sufficient for chat
5. **External checkout flow**: User's main site (Next.js) → redirect to Shopify checkout
6. **Cloudflare Pages for widget**: Fast global CDN, simple deployment

## Reports

- [RAG Architecture](../reports/researcher-260215-0128-rag-architecture.md)
- [Shopify Integration](../reports/researcher-260215-0128-shopify-integration.md)
- [Backend Stack](../reports/researcher-260215-0128-backend-stack.md)
