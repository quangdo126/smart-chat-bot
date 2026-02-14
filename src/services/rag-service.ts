/**
 * RAG (Retrieval-Augmented Generation) Service
 * Combines vector search for products and FAQs with tenant isolation
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { ProductSearchResult, FaqSearchResult } from '../db/supabase-client.js'
import type { EmbeddingsService } from './embeddings-service.js'

const DEFAULT_PRODUCT_LIMIT = 5
const DEFAULT_FAQ_LIMIT = 3
const DEFAULT_SIMILARITY_THRESHOLD = 0.25

export interface ProductResult {
  id: string
  title: string
  description: string | null
  price: number | null
  currency: string
  imageUrl: string | null
  category: string | null
  similarity: number
}

export interface FaqResult {
  question: string
  answer: string
  category: string | null
  similarity: number
}

export interface RagResult {
  products: ProductResult[]
  faqs: FaqResult[]
}

export interface RagConfig {
  productLimit?: number
  faqLimit?: number
  similarityThreshold?: number
}

export class RagService {
  private supabase: SupabaseClient
  private embeddings: EmbeddingsService
  private config: Required<RagConfig>

  constructor(
    supabase: SupabaseClient,
    embeddings: EmbeddingsService,
    config?: RagConfig
  ) {
    this.supabase = supabase
    this.embeddings = embeddings
    this.config = {
      productLimit: config?.productLimit ?? DEFAULT_PRODUCT_LIMIT,
      faqLimit: config?.faqLimit ?? DEFAULT_FAQ_LIMIT,
      similarityThreshold: config?.similarityThreshold ?? DEFAULT_SIMILARITY_THRESHOLD,
    }
  }

  /**
   * Search products by semantic similarity to query
   * Uses search_products RPC function with vector search
   */
  async searchProducts(
    tenantId: string,
    query: string,
    limit?: number
  ): Promise<ProductResult[]> {
    if (!query || query.trim().length === 0) {
      return []
    }

    // Generate query embedding using embedQuery for better search performance
    const queryEmbedding = await this.embeddings.embedQuery(query)

    // Call search_products RPC
    const { data, error } = await this.supabase.rpc('search_products', {
      query_embedding: queryEmbedding,
      p_tenant_id: tenantId,
      p_limit: limit ?? this.config.productLimit,
    })

    if (error) {
      throw new Error(`Product search failed: ${error.message}`)
    }

    // Filter by similarity threshold and map to result type
    const results = (data ?? []) as ProductSearchResult[]
    return results
      .filter((p) => p.similarity >= this.config.similarityThreshold)
      .map((p) => ({
        id: p.id,
        title: p.title,
        description: p.description,
        price: p.price,
        currency: p.currency,
        imageUrl: p.image_url,
        category: p.category,
        similarity: p.similarity,
      }))
  }

  /**
   * Search FAQs by semantic similarity to query
   * Uses search_faqs RPC function with vector search
   */
  async searchFaqs(
    tenantId: string,
    query: string,
    limit?: number
  ): Promise<FaqResult[]> {
    if (!query || query.trim().length === 0) {
      return []
    }

    // Generate query embedding using embedQuery for better search performance
    const queryEmbedding = await this.embeddings.embedQuery(query)

    // Call search_faqs RPC
    const { data, error } = await this.supabase.rpc('search_faqs', {
      query_embedding: queryEmbedding,
      p_tenant_id: tenantId,
      p_limit: limit ?? this.config.faqLimit,
    })

    if (error) {
      throw new Error(`FAQ search failed: ${error.message}`)
    }

    // Filter by similarity threshold and map to result type
    const results = (data ?? []) as FaqSearchResult[]
    return results
      .filter((f) => f.similarity >= this.config.similarityThreshold)
      .map((f) => ({
        question: f.question,
        answer: f.answer,
        category: f.category,
        similarity: f.similarity,
      }))
  }

  /**
   * Combined search across products and FAQs
   * Runs both searches in parallel for better performance
   */
  async search(tenantId: string, query: string): Promise<RagResult> {
    if (!query || query.trim().length === 0) {
      return { products: [], faqs: [] }
    }

    // Generate embedding once using embedQuery for search queries
    const queryEmbedding = await this.embeddings.embedQuery(query)

    // Run both searches in parallel
    const [productsResult, faqsResult] = await Promise.all([
      this.supabase.rpc('search_products', {
        query_embedding: queryEmbedding,
        p_tenant_id: tenantId,
        p_limit: this.config.productLimit,
      }),
      this.supabase.rpc('search_faqs', {
        query_embedding: queryEmbedding,
        p_tenant_id: tenantId,
        p_limit: this.config.faqLimit,
      }),
    ])

    if (productsResult.error) {
      throw new Error(`Product search failed: ${productsResult.error.message}`)
    }

    if (faqsResult.error) {
      throw new Error(`FAQ search failed: ${faqsResult.error.message}`)
    }

    // Filter and map results
    const productData = (productsResult.data ?? []) as ProductSearchResult[]
    const faqData = (faqsResult.data ?? []) as FaqSearchResult[]

    const products = productData
      .filter((p) => p.similarity >= this.config.similarityThreshold)
      .map((p) => ({
        id: p.id,
        title: p.title,
        description: p.description,
        price: p.price,
        currency: p.currency,
        imageUrl: p.image_url,
        category: p.category,
        similarity: p.similarity,
      }))

    const faqs = faqData
      .filter((f) => f.similarity >= this.config.similarityThreshold)
      .map((f) => ({
        question: f.question,
        answer: f.answer,
        category: f.category,
        similarity: f.similarity,
      }))

    return { products, faqs }
  }

  /**
   * Build context string for LLM prompt from RAG results
   */
  buildContext(results: RagResult): string {
    const sections: string[] = []

    if (results.products.length > 0) {
      const productList = results.products
        .map((p) => {
          const price = p.price ? `$${p.price} ${p.currency}` : 'Price not available'
          return `- ${p.title}: ${p.description ?? 'No description'} (${price})`
        })
        .join('\n')

      sections.push(`**Relevant Products:**\n${productList}`)
    }

    if (results.faqs.length > 0) {
      const faqList = results.faqs
        .map((f) => `Q: ${f.question}\nA: ${f.answer}`)
        .join('\n\n')

      sections.push(`**Relevant FAQs:**\n${faqList}`)
    }

    return sections.join('\n\n')
  }
}

/**
 * Factory function to create RAG service
 */
export function createRagService(
  supabase: SupabaseClient,
  embeddings: EmbeddingsService,
  config?: RagConfig
): RagService {
  return new RagService(supabase, embeddings, config)
}
