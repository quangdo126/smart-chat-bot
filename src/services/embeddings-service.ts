/**
 * Voyage AI Embeddings Service for vector generation
 * Uses voyage-4-large model (1024 dimensions)
 * Voyage AI is Anthropic's official embedding partner
 */

const VOYAGE_API_URL = 'https://api.voyageai.com/v1/embeddings'
const DEFAULT_MODEL = 'voyage-4-large'
const MAX_BATCH_SIZE = 128
const MAX_RETRIES = 3
const INITIAL_RETRY_DELAY_MS = 1000

export interface EmbeddingsConfig {
  apiKey: string
  model?: string
}

interface VoyageEmbeddingResponse {
  object: 'list'
  data: Array<{
    object: 'embedding'
    embedding: number[]
    index: number
  }>
  model: string
  usage: {
    total_tokens: number
  }
}

interface VoyageErrorResponse {
  detail: string
}

type VoyageInputType = 'document' | 'query'

export class EmbeddingsService {
  private apiKey: string
  private model: string

  constructor(config: EmbeddingsConfig) {
    this.apiKey = config.apiKey
    this.model = config.model ?? DEFAULT_MODEL
  }

  private getHeaders(): Record<string, string> {
    return {
      'Authorization': `Bearer ${this.apiKey}`,
      'Content-Type': 'application/json',
    }
  }

  private async sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }

  private async fetchWithRetry(
    input: string | string[],
    inputType: VoyageInputType
  ): Promise<VoyageEmbeddingResponse> {
    let lastError: Error | null = null

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        const response = await fetch(VOYAGE_API_URL, {
          method: 'POST',
          headers: this.getHeaders(),
          body: JSON.stringify({
            model: this.model,
            input,
            input_type: inputType,
          }),
        })

        // Rate limit - retry with exponential backoff
        if (response.status === 429) {
          const retryAfter = response.headers.get('Retry-After')
          const delayMs = retryAfter
            ? parseInt(retryAfter, 10) * 1000
            : INITIAL_RETRY_DELAY_MS * Math.pow(2, attempt)

          if (attempt < MAX_RETRIES - 1) {
            await this.sleep(delayMs)
            continue
          }
        }

        if (!response.ok) {
          const errorBody = (await response.json()) as VoyageErrorResponse
          throw new Error(
            `Voyage AI Embeddings API error ${response.status}: ${errorBody.detail ?? 'Unknown error'}`
          )
        }

        return response.json() as Promise<VoyageEmbeddingResponse>
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error))

        // Only retry on rate limit or network errors
        const isRetryable =
          lastError.message.includes('429') ||
          lastError.message.includes('fetch')

        if (!isRetryable || attempt >= MAX_RETRIES - 1) {
          throw lastError
        }

        await this.sleep(INITIAL_RETRY_DELAY_MS * Math.pow(2, attempt))
      }
    }

    throw lastError ?? new Error('Max retries exceeded')
  }

  /**
   * Generate embedding vector for a single document text
   * Uses input_type: 'document' for indexing content
   * @param text - Input text to embed
   * @returns 1024-dimensional embedding vector
   */
  async embed(text: string): Promise<number[]> {
    if (!text || text.trim().length === 0) {
      throw new Error('Text cannot be empty')
    }

    const response = await this.fetchWithRetry(text, 'document')
    return response.data[0].embedding
  }

  /**
   * Generate embedding vector for a search query
   * Uses input_type: 'query' for better search performance
   * @param text - Search query text
   * @returns 1024-dimensional embedding vector
   */
  async embedQuery(text: string): Promise<number[]> {
    if (!text || text.trim().length === 0) {
      throw new Error('Query text cannot be empty')
    }

    const response = await this.fetchWithRetry(text, 'query')
    return response.data[0].embedding
  }

  /**
   * Generate embedding vectors for multiple documents in batch
   * Automatically chunks large batches to stay within API limits (128 max)
   * @param texts - Array of input texts to embed
   * @returns Array of embedding vectors in same order as input
   */
  async embedBatch(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) {
      return []
    }

    // Filter and validate texts
    const validTexts = texts.map((t, i) => ({
      text: t?.trim() ?? '',
      index: i,
    }))

    const nonEmpty = validTexts.filter((t) => t.text.length > 0)

    if (nonEmpty.length === 0) {
      throw new Error('All texts are empty')
    }

    // Process in chunks
    const results: Array<{ embedding: number[]; index: number }> = []

    for (let i = 0; i < nonEmpty.length; i += MAX_BATCH_SIZE) {
      const chunk = nonEmpty.slice(i, i + MAX_BATCH_SIZE)
      const chunkTexts = chunk.map((t) => t.text)

      const response = await this.fetchWithRetry(chunkTexts, 'document')

      // Map results back to original indices
      response.data.forEach((item, responseIndex) => {
        results.push({
          embedding: item.embedding,
          index: chunk[responseIndex].index,
        })
      })
    }

    // Sort by original index and extract embeddings
    results.sort((a, b) => a.index - b.index)
    return results.map((r) => r.embedding)
  }
}

/**
 * Factory function to create embeddings service
 */
export function createEmbeddingsService(
  apiKey: string,
  model?: string
): EmbeddingsService {
  return new EmbeddingsService({ apiKey, model })
}
