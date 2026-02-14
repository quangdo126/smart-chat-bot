-- ============================================================================
-- Smart Chat Bot - Multi-tenant Database Schema for Supabase
-- Supports up to 15 tenants (shops) with RLS and pgvector embeddings
-- Uses Voyage AI voyage-3-lite model (1024 dimensions)
-- ============================================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "vector";

-- ============================================================================
-- TABLE: tenants
-- Stores shop/tenant configuration (no RLS - accessed by service role)
-- ============================================================================
CREATE TABLE tenants (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    shopify_store_url TEXT,
    shopify_storefront_token TEXT,
    shopify_admin_token TEXT,
    system_prompt TEXT,
    widget_config JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    CONSTRAINT tenants_id_format CHECK (id ~ '^[a-z0-9-]+$')
);

-- Trigger to auto-update updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tenants_updated_at
    BEFORE UPDATE ON tenants
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- TABLE: products
-- Stores product data with vector embeddings for semantic search
-- ============================================================================
CREATE TABLE products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    shopify_product_id TEXT,
    title TEXT NOT NULL,
    description TEXT,
    price DECIMAL(10,2),
    currency TEXT DEFAULT 'USD',
    image_url TEXT,
    category TEXT,
    tags TEXT[],
    embedding vector(1024),
    metadata JSONB DEFAULT '{}'::jsonb,
    synced_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),

    CONSTRAINT products_tenant_shopify_unique UNIQUE (tenant_id, shopify_product_id)
);

-- ============================================================================
-- TABLE: faqs
-- Stores FAQ entries with vector embeddings for semantic search
-- ============================================================================
CREATE TABLE faqs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    question TEXT NOT NULL,
    answer TEXT NOT NULL,
    category TEXT,
    embedding vector(1024),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- TABLE: conversations
-- Tracks chat sessions per tenant
-- ============================================================================
CREATE TABLE conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    session_id TEXT NOT NULL,
    customer_email TEXT,
    started_at TIMESTAMPTZ DEFAULT NOW(),
    last_message_at TIMESTAMPTZ,
    metadata JSONB DEFAULT '{}'::jsonb,

    CONSTRAINT conversations_tenant_session_unique UNIQUE (tenant_id, session_id)
);

-- ============================================================================
-- TABLE: messages
-- Stores individual messages within conversations
-- ============================================================================
CREATE TABLE messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    tool_calls JSONB,
    tokens_used INTEGER,
    created_at TIMESTAMPTZ DEFAULT NOW(),

    CONSTRAINT messages_role_check CHECK (role IN ('user', 'assistant', 'system'))
);

-- ============================================================================
-- ROW LEVEL SECURITY (RLS)
-- Tenant isolation using app.tenant_id session variable
-- ============================================================================

-- Enable RLS on tenant-scoped tables
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE faqs ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

-- Products policies
CREATE POLICY products_tenant_isolation ON products
    FOR ALL
    USING (tenant_id = current_setting('app.tenant_id', true))
    WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

-- FAQs policies
CREATE POLICY faqs_tenant_isolation ON faqs
    FOR ALL
    USING (tenant_id = current_setting('app.tenant_id', true))
    WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

-- Conversations policies
CREATE POLICY conversations_tenant_isolation ON conversations
    FOR ALL
    USING (tenant_id = current_setting('app.tenant_id', true))
    WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

-- Messages policies (via conversation's tenant_id)
CREATE POLICY messages_tenant_isolation ON messages
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM conversations c
            WHERE c.id = messages.conversation_id
            AND c.tenant_id = current_setting('app.tenant_id', true)
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM conversations c
            WHERE c.id = messages.conversation_id
            AND c.tenant_id = current_setting('app.tenant_id', true)
        )
    );

-- ============================================================================
-- INDEXES
-- Optimized for multi-tenant queries and vector similarity search
-- ============================================================================

-- Products indexes
CREATE INDEX idx_products_tenant_id ON products(tenant_id);
CREATE INDEX idx_products_tenant_category ON products(tenant_id, category);
CREATE INDEX idx_products_tenant_tags ON products USING GIN(tags);
CREATE INDEX idx_products_synced_at ON products(tenant_id, synced_at);

-- Products vector index (IVFFlat for ~15 tenants with moderate data)
-- Lists = 4 * sqrt(rows_per_tenant) - adjust based on actual data volume
CREATE INDEX idx_products_embedding ON products
    USING ivfflat (embedding vector_cosine_ops)
    WITH (lists = 100);

-- FAQs indexes
CREATE INDEX idx_faqs_tenant_id ON faqs(tenant_id);
CREATE INDEX idx_faqs_tenant_category ON faqs(tenant_id, category);

-- FAQs vector index
CREATE INDEX idx_faqs_embedding ON faqs
    USING ivfflat (embedding vector_cosine_ops)
    WITH (lists = 50);

-- Conversations indexes
CREATE INDEX idx_conversations_tenant_session ON conversations(tenant_id, session_id);
CREATE INDEX idx_conversations_tenant_last_message ON conversations(tenant_id, last_message_at DESC);
CREATE INDEX idx_conversations_customer_email ON conversations(tenant_id, customer_email)
    WHERE customer_email IS NOT NULL;

-- Messages indexes
CREATE INDEX idx_messages_conversation_created ON messages(conversation_id, created_at);

-- ============================================================================
-- FUNCTIONS
-- Vector similarity search functions for products and FAQs
-- ============================================================================

-- Search products by vector similarity
CREATE OR REPLACE FUNCTION search_products(
    query_embedding vector(1024),
    p_tenant_id TEXT,
    p_limit INTEGER DEFAULT 5
)
RETURNS TABLE (
    id UUID,
    shopify_product_id TEXT,
    title TEXT,
    description TEXT,
    price DECIMAL(10,2),
    currency TEXT,
    image_url TEXT,
    category TEXT,
    tags TEXT[],
    metadata JSONB,
    similarity FLOAT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN QUERY
    SELECT
        p.id,
        p.shopify_product_id,
        p.title,
        p.description,
        p.price,
        p.currency,
        p.image_url,
        p.category,
        p.tags,
        p.metadata,
        1 - (p.embedding <=> query_embedding) AS similarity
    FROM products p
    WHERE p.tenant_id = p_tenant_id
        AND p.embedding IS NOT NULL
    ORDER BY p.embedding <=> query_embedding
    LIMIT p_limit;
END;
$$;

-- Search FAQs by vector similarity
CREATE OR REPLACE FUNCTION search_faqs(
    query_embedding vector(1024),
    p_tenant_id TEXT,
    p_limit INTEGER DEFAULT 5
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
SET search_path = public
AS $$
BEGIN
    RETURN QUERY
    SELECT
        f.id,
        f.question,
        f.answer,
        f.category,
        1 - (f.embedding <=> query_embedding) AS similarity
    FROM faqs f
    WHERE f.tenant_id = p_tenant_id
        AND f.embedding IS NOT NULL
    ORDER BY f.embedding <=> query_embedding
    LIMIT p_limit;
END;
$$;

-- Helper function to set tenant context for RLS
CREATE OR REPLACE FUNCTION set_tenant_context(p_tenant_id TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    PERFORM set_config('app.tenant_id', p_tenant_id, false);
END;
$$;

-- ============================================================================
-- GRANTS
-- Service role bypasses RLS, anon role uses RLS policies
-- ============================================================================

-- Grant usage on schema
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

-- Grant table permissions
GRANT SELECT ON tenants TO anon, authenticated;
GRANT ALL ON tenants TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON products TO authenticated;
GRANT ALL ON products TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON faqs TO authenticated;
GRANT ALL ON faqs TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON conversations TO authenticated;
GRANT ALL ON conversations TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON messages TO authenticated;
GRANT ALL ON messages TO service_role;

-- Grant function execution
GRANT EXECUTE ON FUNCTION search_products TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION search_faqs TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION set_tenant_context TO authenticated, service_role;

-- ============================================================================
-- COMMENTS
-- Documentation for schema objects
-- ============================================================================

COMMENT ON TABLE tenants IS 'Multi-tenant shop configuration (max 15 tenants)';
COMMENT ON TABLE products IS 'Product catalog with vector embeddings for semantic search';
COMMENT ON TABLE faqs IS 'FAQ entries with vector embeddings for semantic search';
COMMENT ON TABLE conversations IS 'Chat sessions tracked per tenant and browser session';
COMMENT ON TABLE messages IS 'Individual chat messages within conversations';

COMMENT ON FUNCTION search_products IS 'Vector similarity search for products within a tenant';
COMMENT ON FUNCTION search_faqs IS 'Vector similarity search for FAQs within a tenant';
COMMENT ON FUNCTION set_tenant_context IS 'Sets RLS tenant context for current session';
