/**
 * Claudible API Client with stealth headers for Claude Haiku
 * Uses /v1/messages endpoint with stealth bypass
 */

const CLAUDIBLE_BASE_URL = 'https://claudible.io/v1/messages'
const DEFAULT_MODEL = 'claude-haiku-4.5'
const DEFAULT_MAX_TOKENS = 4096
const MAX_RETRIES = 3
const INITIAL_RETRY_DELAY_MS = 1000

// Stealth headers to bypass Claude Code tier restriction
const STEALTH_HEADERS = {
  'X-Claude-Client': 'claude-code/2.1.2',
  'User-Agent': 'claude-code/2.1.2',
}

export interface ClaudibleConfig {
  apiKey: string
  model?: string
  maxTokens?: number
  temperature?: number
}

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface ClaudibleResponse {
  id: string
  content: Array<{ type: 'text'; text: string }>
  usage: { input_tokens: number; output_tokens: number }
}

interface AnthropicRequestBody {
  model: string
  max_tokens: number
  messages: ChatMessage[]
  system?: string
  temperature?: number
  stream?: boolean
}

interface SSEEvent {
  type: string
  delta?: { type: string; text?: string }
  message?: ClaudibleResponse
}

export class ClaudibleClient {
  private apiKey: string
  private model: string
  private maxTokens: number
  private temperature: number

  constructor(config: ClaudibleConfig) {
    this.apiKey = config.apiKey
    this.model = config.model ?? DEFAULT_MODEL
    this.maxTokens = config.maxTokens ?? DEFAULT_MAX_TOKENS
    this.temperature = config.temperature ?? 0.7
  }

  private getHeaders(): Record<string, string> {
    return {
      'x-api-key': this.apiKey,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
      ...STEALTH_HEADERS,
    }
  }

  private buildRequestBody(
    messages: ChatMessage[],
    systemPrompt?: string,
    stream = false
  ): AnthropicRequestBody {
    const body: AnthropicRequestBody = {
      model: this.model,
      max_tokens: this.maxTokens,
      temperature: this.temperature,
      messages,
    }

    if (systemPrompt) {
      body.system = systemPrompt
    }

    if (stream) {
      body.stream = true
    }

    return body
  }

  private async sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }

  private async fetchWithRetry(
    body: AnthropicRequestBody,
    isStream = false
  ): Promise<Response> {
    let lastError: Error | null = null

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        const response = await fetch(CLAUDIBLE_BASE_URL, {
          method: 'POST',
          headers: this.getHeaders(),
          body: JSON.stringify(body),
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

        // Other errors - don't retry
        if (!response.ok && response.status !== 429) {
          const errorText = await response.text()
          throw new Error(`Claudible API error ${response.status}: ${errorText}`)
        }

        if (response.ok) {
          return response
        }
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error))

        // Don't retry on non-rate-limit errors
        if (!lastError.message.includes('429')) {
          throw lastError
        }

        if (attempt < MAX_RETRIES - 1) {
          await this.sleep(INITIAL_RETRY_DELAY_MS * Math.pow(2, attempt))
        }
      }
    }

    throw lastError ?? new Error('Max retries exceeded')
  }

  /**
   * Non-streaming chat completion
   */
  async chat(messages: ChatMessage[], systemPrompt?: string): Promise<string> {
    const body = this.buildRequestBody(messages, systemPrompt, false)
    const response = await this.fetchWithRetry(body)
    const data = (await response.json()) as ClaudibleResponse

    return data.content
      .filter((c) => c.type === 'text')
      .map((c) => c.text)
      .join('')
  }

  /**
   * Streaming chat completion using SSE
   * Yields text chunks as they arrive
   */
  async *chatStream(
    messages: ChatMessage[],
    systemPrompt?: string
  ): AsyncGenerator<string> {
    const body = this.buildRequestBody(messages, systemPrompt, true)
    const response = await this.fetchWithRetry(body, true)

    if (!response.body) {
      throw new Error('Response body is null')
    }

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    try {
      while (true) {
        const { done, value } = await reader.read()

        if (done) break

        buffer += decoder.decode(value, { stream: true })

        // Process complete SSE events
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? '' // Keep incomplete line in buffer

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue

          const data = line.slice(6).trim() // Remove 'data: ' prefix

          if (data === '[DONE]') return

          try {
            const event = JSON.parse(data) as SSEEvent

            // Handle content_block_delta events
            if (
              event.type === 'content_block_delta' &&
              event.delta?.type === 'text_delta' &&
              event.delta.text
            ) {
              yield event.delta.text
            }
          } catch {
            // Skip malformed JSON lines
          }
        }
      }
    } finally {
      reader.releaseLock()
    }
  }

  /**
   * Get raw response with full metadata
   */
  async chatRaw(
    messages: ChatMessage[],
    systemPrompt?: string
  ): Promise<ClaudibleResponse> {
    const body = this.buildRequestBody(messages, systemPrompt, false)
    const response = await this.fetchWithRetry(body)
    return response.json() as Promise<ClaudibleResponse>
  }
}

/**
 * Factory function for creating client from environment
 */
export function createClaudibleClient(
  apiKey: string,
  options?: Omit<ClaudibleConfig, 'apiKey'>
): ClaudibleClient {
  return new ClaudibleClient({
    apiKey,
    ...options,
  })
}
