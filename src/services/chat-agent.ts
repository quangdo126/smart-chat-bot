/**
 * Chat Agent - Main orchestration for AI sales assistant
 * Handles message processing with Claude tool_use for multi-step conversations
 */

import type { ClaudibleClient, ChatMessage } from './claudible-client.js'
import type { RagService } from './rag-service.js'
import type { TenantService } from './tenant-service.js'
import { ShopifyFactory } from './shopify-factory.js'
import {
  ToolExecutor,
  AGENT_TOOLS,
  type AgentContext,
  type ToolResult,
} from './agent-tools.js'
import {
  DEFAULT_SYSTEM_PROMPT,
  buildSystemPrompt,
  buildToolGuidance,
} from '../config/system-prompts.js'

const MAX_TOOL_ITERATIONS = 5
const CLAUDIBLE_TOOL_URL = 'https://claudible.io/v1/messages'

/**
 * Tool call from Claude response
 */
interface ToolUseBlock {
  type: 'tool_use'
  id: string
  name: string
  input: Record<string, unknown>
}

/**
 * Text block from Claude response
 */
interface TextBlock {
  type: 'text'
  text: string
}

/**
 * Content block union type
 */
type ContentBlock = ToolUseBlock | TextBlock

/**
 * Claude API response with tool_use
 */
interface ClaudeResponse {
  id: string
  content: ContentBlock[]
  stop_reason: 'end_turn' | 'tool_use' | 'max_tokens'
  usage: { input_tokens: number; output_tokens: number }
}

/**
 * Agent response returned to caller
 */
export interface AgentResponse {
  reply: string
  toolCalls?: Array<{ tool: string; result: ToolResult }>
  cartId?: string
  checkoutUrl?: string
}

/**
 * Stream event types
 */
export type StreamEvent =
  | { type: 'text'; data: string }
  | { type: 'tool'; data: { tool: string; result: ToolResult } }
  | { type: 'done'; data: AgentResponse }
  | { type: 'error'; data: string }

/**
 * Chat Agent class - orchestrates AI conversations with tool calling
 */
export class ChatAgent {
  private claudible: ClaudibleClient
  private rag: RagService
  private tenantService: TenantService
  private toolExecutor: ToolExecutor
  private apiKey: string

  constructor(
    claudible: ClaudibleClient,
    rag: RagService,
    tenantService: TenantService,
    shopifyFactory: typeof ShopifyFactory,
    apiKey: string
  ) {
    this.claudible = claudible
    this.rag = rag
    this.tenantService = tenantService
    this.toolExecutor = new ToolExecutor(rag, tenantService, shopifyFactory)
    this.apiKey = apiKey
  }

  /**
   * Build system prompt with tenant customization and RAG context
   */
  private async buildPrompt(context: AgentContext, userQuery: string): Promise<string> {
    // Get tenant config for custom prompt
    const tenant = await this.tenantService.getTenant(context.tenantId)
    const tenantPrompt = tenant?.systemPrompt ?? null

    // Get RAG context based on user query
    const ragResults = await this.rag.search(context.tenantId, userQuery)
    const ragContext = this.rag.buildContext(ragResults)

    // Combine prompts
    const basePrompt = buildSystemPrompt(tenantPrompt, ragContext)
    const toolGuidance = buildToolGuidance()

    return `${basePrompt}\n${toolGuidance}`
  }

  /**
   * Call Claude API with tool_use support
   */
  private async callClaude(
    messages: ChatMessage[],
    systemPrompt: string
  ): Promise<ClaudeResponse> {
    const response = await fetch(CLAUDIBLE_TOOL_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
        'X-Claude-Client': 'claude-code/2.1.2',
        'User-Agent': 'claude-code/2.1.2',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4.5',
        max_tokens: 4096,
        system: systemPrompt,
        messages: messages.map((m) => ({
          role: m.role,
          content: m.content,
        })),
        tools: AGENT_TOOLS,
      }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`Claude API error: ${response.status} - ${errorText}`)
    }

    return response.json() as Promise<ClaudeResponse>
  }

  /**
   * Call Claude API with tool results
   */
  private async callClaudeWithToolResults(
    messages: Array<{ role: string; content: unknown }>,
    systemPrompt: string
  ): Promise<ClaudeResponse> {
    const response = await fetch(CLAUDIBLE_TOOL_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
        'X-Claude-Client': 'claude-code/2.1.2',
        'User-Agent': 'claude-code/2.1.2',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4.5',
        max_tokens: 4096,
        system: systemPrompt,
        messages,
        tools: AGENT_TOOLS,
      }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`Claude API error: ${response.status} - ${errorText}`)
    }

    return response.json() as Promise<ClaudeResponse>
  }

  /**
   * Extract text content from Claude response
   */
  private extractText(content: ContentBlock[]): string {
    return content
      .filter((block): block is TextBlock => block.type === 'text')
      .map((block) => block.text)
      .join('')
  }

  /**
   * Extract tool use blocks from Claude response
   */
  private extractToolUse(content: ContentBlock[]): ToolUseBlock[] {
    return content.filter((block): block is ToolUseBlock => block.type === 'tool_use')
  }

  /**
   * Process message with tool calling (non-streaming)
   * Handles multi-turn tool use until Claude provides final response
   */
  async processMessage(
    messages: ChatMessage[],
    context: AgentContext
  ): Promise<AgentResponse> {
    // Get last user message for RAG context
    const lastUserMessage = [...messages].reverse().find((m) => m.role === 'user')
    const userQuery = lastUserMessage?.content || ''

    // Build system prompt
    const systemPrompt = await this.buildPrompt(context, userQuery)

    // Track tool calls for response
    const allToolCalls: Array<{ tool: string; result: ToolResult }> = []
    let cartId = context.cartId
    let checkoutUrl: string | undefined

    // Initial Claude call
    let claudeResponse = await this.callClaude(messages, systemPrompt)
    let iterations = 0

    // Build conversation messages for tool use loop
    const conversationMessages: Array<{ role: string; content: unknown }> = messages.map(
      (m) => ({
        role: m.role,
        content: m.content,
      })
    )

    // Loop until Claude stops using tools or max iterations
    while (
      claudeResponse.stop_reason === 'tool_use' &&
      iterations < MAX_TOOL_ITERATIONS
    ) {
      iterations++

      // Get tool use blocks
      const toolUseBlocks = this.extractToolUse(claudeResponse.content)

      // Add assistant message with tool use
      conversationMessages.push({
        role: 'assistant',
        content: claudeResponse.content,
      })

      // Execute each tool and collect results
      const toolResults: Array<{
        type: 'tool_result'
        tool_use_id: string
        content: string
      }> = []

      for (const toolBlock of toolUseBlocks) {
        const result = await this.toolExecutor.execute(
          toolBlock.name,
          toolBlock.input,
          { ...context, cartId }
        )

        allToolCalls.push({ tool: toolBlock.name, result })

        // Extract cart info from results
        if (result.success && result.data) {
          const data = result.data as Record<string, unknown>
          if (data.cartId) cartId = data.cartId as string
          if (data.checkoutUrl) checkoutUrl = data.checkoutUrl as string
        }

        toolResults.push({
          type: 'tool_result',
          tool_use_id: toolBlock.id,
          content: JSON.stringify(result),
        })
      }

      // Add tool results as user message
      conversationMessages.push({
        role: 'user',
        content: toolResults,
      })

      // Call Claude again with tool results
      claudeResponse = await this.callClaudeWithToolResults(
        conversationMessages,
        systemPrompt
      )
    }

    // Extract final text response
    const reply = this.extractText(claudeResponse.content)

    return {
      reply,
      toolCalls: allToolCalls.length > 0 ? allToolCalls : undefined,
      cartId,
      checkoutUrl,
    }
  }

  /**
   * Process message with streaming support
   * Yields events as they occur (text chunks, tool executions, done)
   */
  async *processMessageStream(
    messages: ChatMessage[],
    context: AgentContext
  ): AsyncGenerator<StreamEvent> {
    try {
      // For now, use non-streaming with chunked output
      // Full streaming would require SSE parsing from Claude API
      const response = await this.processMessage(messages, context)

      // Emit tool calls first
      if (response.toolCalls) {
        for (const toolCall of response.toolCalls) {
          yield { type: 'tool', data: toolCall }
        }
      }

      // Emit text in chunks to simulate streaming
      const chunkSize = 50
      for (let i = 0; i < response.reply.length; i += chunkSize) {
        const chunk = response.reply.slice(i, i + chunkSize)
        yield { type: 'text', data: chunk }
      }

      // Emit done event
      yield { type: 'done', data: response }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      yield { type: 'error', data: message }
    }
  }
}

/**
 * Factory function to create chat agent
 */
export function createChatAgent(
  claudible: ClaudibleClient,
  rag: RagService,
  tenantService: TenantService,
  shopifyFactory: typeof ShopifyFactory,
  apiKey: string
): ChatAgent {
  return new ChatAgent(claudible, rag, tenantService, shopifyFactory, apiKey)
}

// Re-export types
export type { AgentContext } from './agent-tools.js'
