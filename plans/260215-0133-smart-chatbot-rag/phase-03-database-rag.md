# Phase 3: Database & RAG (Multi-tenant)

## Context Links
- [Plan Overview](plan.md)
- [RAG Architecture Report](../reports/researcher-260215-0128-rag-architecture.md)

## Overview
- **Priority:** P1 - Critical
- **Status:** pending
- **Effort:** 8h

Setup multi-tenant Supabase PostgreSQL with pgvector, Row Level Security (RLS) for tenant isolation, and embedding pipeline for 2000+ products per tenant.

## Key Insights
- pgvector: No chunking needed for products (atomic units)
- OpenAI text-embedding-3-small: 1536 dims, $0.02/1M tokens
- Hybrid search: vector similarity + SQL filters (price, category)
- Supabase free tier: 500MB sufficient for ~15 tenants x 3000 products each
- RLS: Automatic tenant isolation at database level

## Multi-tenant Strategy

| Aspect | Implementation |
|--------|----------------|
| Isolation | Row Level Security (RLS) |
| Tenant ID | `tenant_id TEXT` column on all tables |
| Session Var | `SET app.tenant_id = 'shop-abc'` before queries |
| Max Tenants | 15 shops |

## Requirements

### Functional
- Store tenants with Shopify credentials
- Store products with embeddings (per tenant)
- Store FAQs with embeddings (per tenant)
- Store conversation history (per tenant)
- Semantic search with filters (auto-filtered by tenant)
- Embedding generation pipeline

### Non-Functional
- Search latency <200ms
- Support 2000+ products per tenant
- Incremental updates (no full re-index)
- Complete tenant isolation

## Database Schema

```sql
-- Enable pgvector
CREATE EXTENSION IF NOT EXISTS vector;

-- ============================================
-- TENANTS TABLE (Core multi-tenant config)
-- ============================================
CREATE TABLE tenants (
  id TEXT PRIMARY KEY,  -- 'shop-abc', 'shop-xyz'
  name TEXT NOT NULL,
  shopify_store_url TEXT,
  shopify_storefront_token TEXT,
  shopify_admin_token TEXT,
  system_prompt TEXT,  -- Custom AI prompt per tenant
  welcome_message TEXT DEFAULT 'Xin chào! Tôi có thể giúp gì cho bạn?',
  primary_color TEXT DEFAULT '#3B82F6',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- PRODUCTS TABLE (with tenant_id)
-- ============================================
CREATE TABLE products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  shopify_product_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  price DECIMAL(10,2),
  currency TEXT DEFAULT 'VND',
  category TEXT,
  tags TEXT[],
  image_url TEXT,
  available BOOLEAN DEFAULT true,
  embedding vector(1536),
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(tenant_id, shopify_product_id)
);

-- ============================================
-- FAQs TABLE (with tenant_id)
-- ============================================
CREATE TABLE faqs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  category TEXT,
  embedding vector(1536),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- CONVERSATIONS TABLE (with tenant_id)
-- ============================================
CREATE TABLE conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  customer_id TEXT,
  customer_email TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- MESSAGES TABLE (with tenant_id)
-- ============================================
CREATE TABLE messages (
  id BIGSERIAL PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- INDEXES
-- ============================================
-- Tenant-scoped vector indexes
CREATE INDEX idx_products_tenant ON products(tenant_id);
CREATE INDEX idx_products_embedding ON products
  USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
CREATE INDEX idx_products_category ON products(tenant_id, category);
CREATE INDEX idx_products_price ON products(tenant_id, price);
CREATE INDEX idx_products_available ON products(tenant_id, available);

CREATE INDEX idx_faqs_tenant ON faqs(tenant_id);
CREATE INDEX idx_faqs_embedding ON faqs
  USING ivfflat (embedding vector_cosine_ops) WITH (lists = 50);

CREATE INDEX idx_conversations_tenant ON conversations(tenant_id);
CREATE INDEX idx_conversations_customer ON conversations(tenant_id, customer_id);

CREATE INDEX idx_messages_tenant ON messages(tenant_id);
CREATE INDEX idx_messages_conversation ON messages(conversation_id, created_at DESC);

-- ============================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================
-- Enable RLS on all tenant-scoped tables
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE faqs ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

-- RLS Policies: Filter by app.tenant_id session variable
CREATE POLICY tenant_isolation_products ON products
  FOR ALL USING (tenant_id = current_setting('app.tenant_id', true));

CREATE POLICY tenant_isolation_faqs ON faqs
  FOR ALL USING (tenant_id = current_setting('app.tenant_id', true));

CREATE POLICY tenant_isolation_conversations ON conversations
  FOR ALL USING (tenant_id = current_setting('app.tenant_id', true));

CREATE POLICY tenant_isolation_messages ON messages
  FOR ALL USING (tenant_id = current_setting('app.tenant_id', true));

-- ============================================
-- HELPER FUNCTION: Set tenant context
-- ============================================
CREATE OR REPLACE FUNCTION set_tenant_context(p_tenant_id TEXT)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  PERFORM set_config('app.tenant_id', p_tenant_id, false);
END;
$$;

-- ============================================
-- FUNCTION: Search products by similarity + filters (tenant-scoped)
-- ============================================
CREATE OR REPLACE FUNCTION search_products(
  p_tenant_id TEXT,
  query_embedding vector(1536),
  match_threshold FLOAT DEFAULT 0.5,
  match_count INT DEFAULT 5,
  filter_category TEXT DEFAULT NULL,
  filter_max_price DECIMAL DEFAULT NULL,
  filter_available BOOLEAN DEFAULT true
)
RETURNS TABLE (
  id UUID,
  shopify_product_id TEXT,
  title TEXT,
  description TEXT,
  price DECIMAL,
  category TEXT,
  image_url TEXT,
  similarity FLOAT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    p.id,
    p.shopify_product_id,
    p.title,
    p.description,
    p.price,
    p.category,
    p.image_url,
    1 - (p.embedding <=> query_embedding) as similarity
  FROM products p
  WHERE
    p.tenant_id = p_tenant_id
    AND (filter_available IS NULL OR p.available = filter_available)
    AND (filter_category IS NULL OR p.category = filter_category)
    AND (filter_max_price IS NULL OR p.price <= filter_max_price)
    AND 1 - (p.embedding <=> query_embedding) > match_threshold
  ORDER BY p.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- ============================================
-- FUNCTION: Search FAQs (tenant-scoped)
-- ============================================
CREATE OR REPLACE FUNCTION search_faqs(
  p_tenant_id TEXT,
  query_embedding vector(1536),
  match_threshold FLOAT DEFAULT 0.6,
  match_count INT DEFAULT 3
)
RETURNS TABLE (
  id UUID,
  question TEXT,
  answer TEXT,
  category TEXT,
  similarity FLOAT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    f.id,
    f.question,
    f.answer,
    f.category,
    1 - (f.embedding <=> query_embedding) as similarity
  FROM faqs f
  WHERE
    f.tenant_id = p_tenant_id
    AND 1 - (f.embedding <=> query_embedding) > match_threshold
  ORDER BY f.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;
```

## Related Code Files

### Create
- `src/db/client.ts` - Supabase client with tenant context
- `src/db/schema.sql` - Multi-tenant database schema
- `src/services/embeddings.ts` - OpenAI embeddings
- `src/services/rag.ts` - Tenant-scoped RAG pipeline
- `src/services/tenant.ts` - Tenant config management

## Implementation Steps

### 1. Setup Supabase Project (30min)
1. Create project at supabase.com
2. Enable pgvector extension: Database > Extensions > vector
3. Run schema.sql in SQL Editor
4. Copy project URL and service role key (for RLS bypass in backend)
5. Create first tenant record for testing

### 2. Tenant Service (30min)
```typescript
// src/services/tenant.ts
import { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '../db/client'

export interface TenantConfig {
  id: string
  name: string
  shopifyStoreUrl: string | null
  shopifyStorefrontToken: string | null
  shopifyAdminToken: string | null
  systemPrompt: string | null
  welcomeMessage: string
  primaryColor: string
}

export class TenantService {
  constructor(private db: SupabaseClient<Database>) {}

  async getConfig(tenantId: string): Promise<TenantConfig | null> {
    const { data, error } = await this.db
      .from('tenants')
      .select('*')
      .eq('id', tenantId)
      .single()

    if (error || !data) return null

    return {
      id: data.id,
      name: data.name,
      shopifyStoreUrl: data.shopify_store_url,
      shopifyStorefrontToken: data.shopify_storefront_token,
      shopifyAdminToken: data.shopify_admin_token,
      systemPrompt: data.system_prompt,
      welcomeMessage: data.welcome_message || 'Xin chào! Tôi có thể giúp gì cho bạn?',
      primaryColor: data.primary_color || '#3B82F6'
    }
  }

  async setTenantContext(tenantId: string): Promise<void> {
    await this.db.rpc('set_tenant_context', { p_tenant_id: tenantId })
  }
}
```

### 3. Supabase Client with Tenant Context (30min)
```typescript
// src/db/client.ts
import { createClient, SupabaseClient } from '@supabase/supabase-js'
import type { Env } from '../config/env'

export type Database = {
  public: {
    Tables: {
      tenants: {
        Row: {
          id: string
          name: string
          shopify_store_url: string | null
          shopify_storefront_token: string | null
          shopify_admin_token: string | null
          system_prompt: string | null
          welcome_message: string | null
          primary_color: string | null
          created_at: string
          updated_at: string
        }
        Insert: Omit<Database['public']['Tables']['tenants']['Row'], 'created_at' | 'updated_at'>
        Update: Partial<Database['public']['Tables']['tenants']['Insert']>
      }
      products: {
        Row: {
          id: string
          tenant_id: string
          shopify_product_id: string
          title: string
          description: string | null
          price: number
          currency: string
          category: string | null
          tags: string[]
          image_url: string | null
          available: boolean
          embedding: number[] | null
          metadata: Record<string, unknown>
          created_at: string
          updated_at: string
        }
        Insert: Omit<Database['public']['Tables']['products']['Row'], 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Database['public']['Tables']['products']['Insert']>
      }
      faqs: {
        Row: {
          id: string
          tenant_id: string
          question: string
          answer: string
          category: string | null
          embedding: number[] | null
          created_at: string
        }
        Insert: Omit<Database['public']['Tables']['faqs']['Row'], 'id' | 'created_at'>
        Update: Partial<Database['public']['Tables']['faqs']['Insert']>
      }
      conversations: {
        Row: {
          id: string
          tenant_id: string
          customer_id: string | null
          customer_email: string | null
          created_at: string
          updated_at: string
        }
        Insert: Omit<Database['public']['Tables']['conversations']['Row'], 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Database['public']['Tables']['conversations']['Insert']>
      }
      messages: {
        Row: {
          id: number
          tenant_id: string
          conversation_id: string
          role: 'user' | 'assistant' | 'system'
          content: string
          metadata: Record<string, unknown>
          created_at: string
        }
        Insert: Omit<Database['public']['Tables']['messages']['Row'], 'id' | 'created_at'>
        Update: Partial<Database['public']['Tables']['messages']['Insert']>
      }
    }
  }
}

export function createSupabaseClient(env: Env): SupabaseClient<Database> {
  // Use service role key for backend (bypasses RLS for admin operations)
  return createClient<Database>(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)
}

export function createSupabaseClientWithTenant(
  env: Env,
  tenantId: string
): SupabaseClient<Database> {
  return createClient<Database>(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
    global: {
      headers: {
        'x-tenant-id': tenantId
      }
    }
  })
}
```

### 4. RAG Service (Tenant-scoped) (1.5h)
```typescript
// src/services/rag.ts
import { SupabaseClient } from '@supabase/supabase-js'
import { EmbeddingsService } from './embeddings'
import type { Database } from '../db/client'

interface SearchOptions {
  category?: string
  maxPrice?: number
  onlyAvailable?: boolean
  limit?: number
}

interface ProductResult {
  id: string
  shopify_product_id: string
  title: string
  description: string | null
  price: number
  category: string | null
  image_url: string | null
  similarity: number
}

interface FAQResult {
  id: string
  question: string
  answer: string
  category: string | null
  similarity: number
}

export class RAGService {
  constructor(
    private db: SupabaseClient<Database>,
    private embeddings: EmbeddingsService,
    private tenantId: string
  ) {}

  async searchProducts(
    query: string,
    options: SearchOptions = {}
  ): Promise<ProductResult[]> {
    const embedding = await this.embeddings.embed(query)

    const { data, error } = await this.db.rpc('search_products', {
      p_tenant_id: this.tenantId,
      query_embedding: embedding,
      match_threshold: 0.5,
      match_count: options.limit ?? 5,
      filter_category: options.category ?? null,
      filter_max_price: options.maxPrice ?? null,
      filter_available: options.onlyAvailable ?? true
    })

    if (error) throw error
    return data as ProductResult[]
  }

  async searchFAQs(query: string, limit = 3): Promise<FAQResult[]> {
    const embedding = await this.embeddings.embed(query)

    const { data, error } = await this.db.rpc('search_faqs', {
      p_tenant_id: this.tenantId,
      query_embedding: embedding,
      match_threshold: 0.6,
      match_count: limit
    })

    if (error) throw error
    return data as FAQResult[]
  }

  async buildContext(query: string): Promise<string> {
    const [products, faqs] = await Promise.all([
      this.searchProducts(query, { limit: 5 }),
      this.searchFAQs(query, 3)
    ])

    let context = ''

    if (products.length > 0) {
      context += '## Sản phẩm liên quan\n\n'
      for (const p of products) {
        context += `- **${p.title}** (${p.price.toLocaleString('vi-VN')} VND)\n`
        if (p.description) {
          context += `  ${p.description.slice(0, 200)}...\n`
        }
        context += `  [Product ID: ${p.shopify_product_id}]\n\n`
      }
    }

    if (faqs.length > 0) {
      context += '## Câu hỏi thường gặp\n\n'
      for (const f of faqs) {
        context += `Q: ${f.question}\n`
        context += `A: ${f.answer}\n\n`
      }
    }

    return context
  }

  // Sync product from Shopify (tenant-scoped)
  async upsertProduct(product: {
    shopifyProductId: string
    title: string
    description?: string
    price: number
    category?: string
    tags?: string[]
    imageUrl?: string
    available?: boolean
  }): Promise<void> {
    const textForEmbedding = [
      product.title,
      product.description || '',
      product.category || '',
      ...(product.tags || [])
    ].join(' ')

    const embedding = await this.embeddings.embed(textForEmbedding)

    const { error } = await this.db.from('products').upsert({
      tenant_id: this.tenantId,
      shopify_product_id: product.shopifyProductId,
      title: product.title,
      description: product.description || null,
      price: product.price,
      category: product.category || null,
      tags: product.tags || [],
      image_url: product.imageUrl || null,
      available: product.available ?? true,
      embedding,
      metadata: {}
    }, {
      onConflict: 'tenant_id,shopify_product_id'
    })

    if (error) throw error
  }

  // Batch sync products (tenant-scoped)
  async syncProducts(products: Array<{
    shopifyProductId: string
    title: string
    description?: string
    price: number
    category?: string
    tags?: string[]
    imageUrl?: string
    available?: boolean
  }>): Promise<{ synced: number; errors: number }> {
    let synced = 0
    let errors = 0

    // Process in batches of 50
    for (let i = 0; i < products.length; i += 50) {
      const batch = products.slice(i, i + 50)

      // Generate embeddings in batch
      const texts = batch.map(p =>
        [p.title, p.description || '', p.category || '', ...(p.tags || [])].join(' ')
      )
      const embeddings = await this.embeddings.embedBatch(texts)

      // Prepare rows with tenant_id
      const rows = batch.map((p, idx) => ({
        tenant_id: this.tenantId,
        shopify_product_id: p.shopifyProductId,
        title: p.title,
        description: p.description || null,
        price: p.price,
        category: p.category || null,
        tags: p.tags || [],
        image_url: p.imageUrl || null,
        available: p.available ?? true,
        embedding: embeddings[idx],
        metadata: {}
      }))

      const { error } = await this.db.from('products').upsert(rows, {
        onConflict: 'tenant_id,shopify_product_id'
      })

      if (error) {
        console.error('Batch sync error:', error)
        errors += batch.length
      } else {
        synced += batch.length
      }
    }

    return { synced, errors }
  }
}
```

### 5. Embeddings Service (45min)
```typescript
// src/services/embeddings.ts
interface EmbeddingResponse {
  data: Array<{ embedding: number[] }>
  usage: { total_tokens: number }
}

export class EmbeddingsService {
  private apiKey: string
  private model = 'text-embedding-3-small'

  constructor(apiKey: string) {
    this.apiKey = apiKey
  }

  async embed(text: string): Promise<number[]> {
    const response = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: this.model,
        input: text.slice(0, 8000)
      })
    })

    if (!response.ok) {
      throw new Error(`Embedding API error: ${response.status}`)
    }

    const data: EmbeddingResponse = await response.json()
    return data.data[0].embedding
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    const response = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: this.model,
        input: texts.map(t => t.slice(0, 8000))
      })
    })

    if (!response.ok) {
      throw new Error(`Embedding API error: ${response.status}`)
    }

    const data: EmbeddingResponse = await response.json()
    return data.data.map(d => d.embedding)
  }
}
```

### 6. Conversation Management (Tenant-scoped) (45min)
```typescript
// src/services/conversation.ts
import { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '../db/client'

type Message = Database['public']['Tables']['messages']['Row']

export class ConversationService {
  constructor(
    private db: SupabaseClient<Database>,
    private tenantId: string
  ) {}

  async create(customerId?: string, customerEmail?: string): Promise<string> {
    const { data, error } = await this.db
      .from('conversations')
      .insert({
        tenant_id: this.tenantId,
        customer_id: customerId || null,
        customer_email: customerEmail || null
      })
      .select('id')
      .single()

    if (error) throw error
    return data.id
  }

  async addMessage(
    conversationId: string,
    role: 'user' | 'assistant',
    content: string,
    metadata?: Record<string, unknown>
  ): Promise<void> {
    const { error } = await this.db.from('messages').insert({
      tenant_id: this.tenantId,
      conversation_id: conversationId,
      role,
      content,
      metadata: metadata || {}
    })

    if (error) throw error
  }

  async getHistory(
    conversationId: string,
    limit = 20
  ): Promise<Array<{ role: 'user' | 'assistant'; content: string }>> {
    const { data, error } = await this.db
      .from('messages')
      .select('role, content')
      .eq('tenant_id', this.tenantId)
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true })
      .limit(limit)

    if (error) throw error
    return data.filter(m => m.role !== 'system') as Array<{ role: 'user' | 'assistant'; content: string }>
  }

  async exists(conversationId: string): Promise<boolean> {
    const { data, error } = await this.db
      .from('conversations')
      .select('id')
      .eq('tenant_id', this.tenantId)
      .eq('id', conversationId)
      .single()

    return !error && !!data
  }
}
```

### 7. Update Chat Route with Multi-tenant RAG (30min)
```typescript
// src/routes/chat.ts (updated for multi-tenant)
// Extract tenant from header and use tenant-scoped services

chatRoutes.post('/chat/stream', async (c) => {
  const tenantId = c.req.header('X-Tenant-ID')
  if (!tenantId) {
    return c.json({ error: 'X-Tenant-ID header required' }, 400)
  }

  const body = await c.req.json<ChatRequest>()
  if (!body.message?.trim()) {
    return c.json({ error: 'Message required' }, 400)
  }

  const db = createSupabaseClient(c.env)

  // Get tenant config
  const tenantService = new TenantService(db)
  const tenant = await tenantService.getConfig(tenantId)
  if (!tenant) {
    return c.json({ error: 'Tenant not found' }, 404)
  }

  const embeddings = new EmbeddingsService(c.env.OPENAI_API_KEY)
  const rag = new RAGService(db, embeddings, tenantId)
  const conversation = new ConversationService(db, tenantId)

  // Build RAG context (auto-filtered by tenant)
  const context = await rag.buildContext(body.message)

  // Use tenant's custom system prompt or default
  const systemPrompt = `${tenant.systemPrompt || BASE_SYSTEM_PROMPT}

## Ngữ cảnh hiện tại
${context}

Sử dụng ngữ cảnh trên để trả lời câu hỏi. Đề cập tên và giá sản phẩm cụ thể.`

  // Rest of streaming implementation...
})
```

## Todo List
- [ ] Create Supabase project and enable pgvector
- [ ] Run multi-tenant schema.sql in Supabase SQL Editor
- [ ] Create `src/services/tenant.ts`
- [ ] Create `src/db/client.ts` with tenant context
- [ ] Create `src/services/embeddings.ts`
- [ ] Create `src/services/rag.ts` (tenant-scoped)
- [ ] Create `src/services/conversation.ts` (tenant-scoped)
- [ ] Update chat routes with X-Tenant-ID header extraction
- [ ] Test RLS policies with multiple tenants
- [ ] Test product search returns only tenant's products
- [ ] Test conversation history isolation

## Success Criteria
- pgvector extension enabled in Supabase
- RLS policies enforce tenant isolation
- Product search returns only tenant's products
- FAQ search returns only tenant's FAQs
- Conversation history isolated per tenant
- Batch sync handles 2000+ products per tenant

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| RLS bypass vulnerability | Low | High | Use service role only in backend, verify tenant header |
| Embedding API cost spike | Medium | Medium | Batch embeddings, cache common queries |
| pgvector slow on cold start | Low | Low | Use HNSW index, warm connection pool |
| Supabase 500MB limit | Medium | Medium | Monitor usage, upgrade if >10 tenants |

## Security Considerations
- RLS policies auto-filter all queries by tenant_id
- Never trust tenant_id from client - validate against tenants table
- Use service role key only in backend (bypasses RLS for admin ops)
- Don't expose raw embeddings in API responses
- Validate conversation ownership before history access
- Store Shopify tokens encrypted (or use Supabase Vault)

## Next Steps
-> [Phase 4: Shopify Integration](phase-04-shopify-integration.md)
