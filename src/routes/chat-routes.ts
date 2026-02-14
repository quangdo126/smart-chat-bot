/**
 * Chat API routes with AI agent tool calling support
 * POST /api/chat - SSE streaming chat with agent
 * POST /api/chat/sync - Non-streaming chat (for testing)
 * POST /api/chat/agent - Agent mode with tool calling
 */

import { Hono } from 'hono'
import { streamSSE } from 'hono/streaming'
import type { Env, ContextVariables, ApiResponse } from '../types/index.js'
import {
  ClaudibleClient,
  createClaudibleClient,
  type ChatMessage as ClaudibleChatMessage,
} from '../services/claudible-client.js'
import { createSupabaseClient, setTenantContext } from '../db/supabase-client.js'
import { createEmbeddingsService } from '../services/embeddings-service.js'
import { createRagService } from '../services/rag-service.js'
import { createTenantService } from '../services/tenant-service.js'
import { ShopifyFactory } from '../services/shopify-factory.js'
import { createChatAgent, type AgentResponse } from '../services/chat-agent.js'

// Input validation limits (DoS prevention)
const MAX_MESSAGE_LENGTH = 10000
const MAX_MESSAGES = 50

// Request body types
interface ChatRequest {
  messages: Array<{ role: 'user' | 'assistant'; content: string }>
  sessionId?: string
  systemPrompt?: string
}

interface AgentChatRequest {
  messages: Array<{ role: 'user' | 'assistant'; content: string }>
  sessionId: string
  cartId?: string
}

// Response types
interface ChatSyncResponse {
  reply: string
  usage?: { input_tokens: number; output_tokens: number }
}

const chatRoutes = new Hono<{ Bindings: Env; Variables: ContextVariables }>()

/**
 * Validate messages array for DoS prevention
 * Returns error message if validation fails, null if valid
 */
function validateMessagesLimits(
  messages: Array<{ role: string; content: string }>
): string | null {
  if (messages.length > MAX_MESSAGES) {
    return `Too many messages. Maximum allowed: ${MAX_MESSAGES}`
  }

  for (const msg of messages) {
    if (msg.content.length > MAX_MESSAGE_LENGTH) {
      return `Message too long. Maximum length: ${MAX_MESSAGE_LENGTH} characters`
    }
  }

  return null
}

/**
 * Get Claudible client from environment
 */
function getClaudibleClient(env: Env): ClaudibleClient {
  const apiKey = env.CLAUDIBLE_API_KEY
  if (!apiKey) {
    throw new Error('CLAUDIBLE_API_KEY not configured')
  }
  return createClaudibleClient(apiKey)
}

/**
 * Create services for agent mode with tenant context
 */
async function createAgentServices(env: Env, tenantId: string) {
  const supabase = createSupabaseClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)

  // Set tenant context for RLS policies
  await setTenantContext(supabase, tenantId)

  const embeddings = createEmbeddingsService(env.VOYAGE_API_KEY)
  const rag = createRagService(supabase, embeddings)
  const tenantService = createTenantService(supabase)

  return { supabase, embeddings, rag, tenantService }
}

/**
 * POST /api/chat - SSE streaming chat endpoint
 * Streams AI responses as Server-Sent Events
 */
chatRoutes.post('/', async (c) => {
  const tenantId = c.get('tenantId')

  // Parse request body
  let body: ChatRequest
  try {
    body = await c.req.json<ChatRequest>()
  } catch {
    const response: ApiResponse<null> = {
      success: false,
      error: 'Invalid JSON body',
      timestamp: new Date().toISOString(),
    }
    return c.json(response, 400)
  }

  // Validate messages array
  if (!body.messages || !Array.isArray(body.messages) || body.messages.length === 0) {
    const response: ApiResponse<null> = {
      success: false,
      error: 'Messages array is required and must not be empty',
      timestamp: new Date().toISOString(),
    }
    return c.json(response, 400)
  }

  // Validate message structure
  const invalidMessage = body.messages.find(
    (m) => !m.role || !['user', 'assistant'].includes(m.role) || typeof m.content !== 'string'
  )
  if (invalidMessage) {
    const response: ApiResponse<null> = {
      success: false,
      error: 'Invalid message format. Each message must have role (user/assistant) and content (string)',
      timestamp: new Date().toISOString(),
    }
    return c.json(response, 400)
  }

  // Validate message limits (DoS prevention)
  const limitsError = validateMessagesLimits(body.messages)
  if (limitsError) {
    const response: ApiResponse<null> = {
      success: false,
      error: limitsError,
      timestamp: new Date().toISOString(),
    }
    return c.json(response, 400)
  }

  try {
    const client = getClaudibleClient(c.env)
    const messages = body.messages as ClaudibleChatMessage[]

    // Build system prompt with tenant context
    const systemPrompt =
      body.systemPrompt ||
      `You are a helpful customer support assistant for tenant ${tenantId}. Be concise and helpful.`

    return streamSSE(c, async (stream) => {
      try {
        // Stream chunks from Claudible
        for await (const chunk of client.chatStream(messages, systemPrompt)) {
          await stream.writeSSE({
            event: 'message',
            data: chunk,
          })
        }

        // Send done event
        await stream.writeSSE({
          event: 'done',
          data: '',
        })
      } catch (error) {
        // Send error event (sanitized - no internal details)
        console.error('SSE stream error:', error)
        await stream.writeSSE({
          event: 'error',
          data: JSON.stringify({ error: 'An error occurred. Please try again.' }),
        })
      }
    })
  } catch (error) {
    console.error('Chat streaming error:', error)
    const response: ApiResponse<null> = {
      success: false,
      error: 'An error occurred. Please try again.',
      timestamp: new Date().toISOString(),
    }
    return c.json(response, 500)
  }
})

/**
 * POST /api/chat/sync - Non-streaming chat endpoint
 * Returns complete response (useful for testing)
 */
chatRoutes.post('/sync', async (c) => {
  const tenantId = c.get('tenantId')

  // Parse request body
  let body: ChatRequest
  try {
    body = await c.req.json<ChatRequest>()
  } catch {
    const response: ApiResponse<null> = {
      success: false,
      error: 'Invalid JSON body',
      timestamp: new Date().toISOString(),
    }
    return c.json(response, 400)
  }

  // Validate messages array
  if (!body.messages || !Array.isArray(body.messages) || body.messages.length === 0) {
    const response: ApiResponse<null> = {
      success: false,
      error: 'Messages array is required and must not be empty',
      timestamp: new Date().toISOString(),
    }
    return c.json(response, 400)
  }

  // Validate message structure
  const invalidMessage = body.messages.find(
    (m) => !m.role || !['user', 'assistant'].includes(m.role) || typeof m.content !== 'string'
  )
  if (invalidMessage) {
    const response: ApiResponse<null> = {
      success: false,
      error: 'Invalid message format. Each message must have role (user/assistant) and content (string)',
      timestamp: new Date().toISOString(),
    }
    return c.json(response, 400)
  }

  // Validate message limits (DoS prevention)
  const limitsError = validateMessagesLimits(body.messages)
  if (limitsError) {
    const response: ApiResponse<null> = {
      success: false,
      error: limitsError,
      timestamp: new Date().toISOString(),
    }
    return c.json(response, 400)
  }

  try {
    const client = getClaudibleClient(c.env)
    const messages = body.messages as ClaudibleChatMessage[]

    // Build system prompt with tenant context
    const systemPrompt =
      body.systemPrompt ||
      `You are a helpful customer support assistant for tenant ${tenantId}. Be concise and helpful.`

    // Get raw response with usage info
    const rawResponse = await client.chatRaw(messages, systemPrompt)

    // Extract text content
    const reply = rawResponse.content
      .filter((item) => item.type === 'text')
      .map((item) => item.text)
      .join('')

    const response: ApiResponse<ChatSyncResponse> = {
      success: true,
      data: {
        reply,
        usage: rawResponse.usage,
      },
      timestamp: new Date().toISOString(),
    }

    return c.json(response)
  } catch (error) {
    console.error('Chat sync error:', error)
    const response: ApiResponse<null> = {
      success: false,
      error: 'An error occurred. Please try again.',
      timestamp: new Date().toISOString(),
    }
    return c.json(response, 500)
  }
})

/**
 * POST /api/chat/agent - Agent mode with tool calling
 * Full agent orchestration with RAG, product search, cart management
 */
chatRoutes.post('/agent', async (c) => {
  const tenantId = c.get('tenantId')

  // Parse request body
  let body: AgentChatRequest
  try {
    body = await c.req.json<AgentChatRequest>()
  } catch {
    const response: ApiResponse<null> = {
      success: false,
      error: 'Invalid JSON body',
      timestamp: new Date().toISOString(),
    }
    return c.json(response, 400)
  }

  // Validate messages array
  if (!body.messages || !Array.isArray(body.messages) || body.messages.length === 0) {
    const response: ApiResponse<null> = {
      success: false,
      error: 'Messages array is required and must not be empty',
      timestamp: new Date().toISOString(),
    }
    return c.json(response, 400)
  }

  // Validate sessionId
  if (!body.sessionId) {
    const response: ApiResponse<null> = {
      success: false,
      error: 'sessionId is required for agent mode',
      timestamp: new Date().toISOString(),
    }
    return c.json(response, 400)
  }

  // Validate message structure
  const invalidMessage = body.messages.find(
    (m) => !m.role || !['user', 'assistant'].includes(m.role) || typeof m.content !== 'string'
  )
  if (invalidMessage) {
    const response: ApiResponse<null> = {
      success: false,
      error: 'Invalid message format. Each message must have role (user/assistant) and content (string)',
      timestamp: new Date().toISOString(),
    }
    return c.json(response, 400)
  }

  // Validate message limits (DoS prevention)
  const limitsError = validateMessagesLimits(body.messages)
  if (limitsError) {
    const response: ApiResponse<null> = {
      success: false,
      error: limitsError,
      timestamp: new Date().toISOString(),
    }
    return c.json(response, 400)
  }

  try {
    // Create services with tenant context for RLS
    const { rag, tenantService } = await createAgentServices(c.env, tenantId!)
    const claudible = getClaudibleClient(c.env)
    const apiKey = c.env.CLAUDIBLE_API_KEY!

    // Create agent
    const agent = createChatAgent(claudible, rag, tenantService, ShopifyFactory, apiKey)

    // Process message with agent
    const agentResponse = await agent.processMessage(
      body.messages as ClaudibleChatMessage[],
      {
        tenantId: tenantId!,
        sessionId: body.sessionId,
        cartId: body.cartId,
      }
    )

    const response: ApiResponse<AgentResponse> = {
      success: true,
      data: agentResponse,
      timestamp: new Date().toISOString(),
    }

    return c.json(response)
  } catch (error) {
    console.error('Agent chat error:', error)
    const response: ApiResponse<null> = {
      success: false,
      error: 'An error occurred. Please try again.',
      timestamp: new Date().toISOString(),
    }
    return c.json(response, 500)
  }
})

/**
 * POST /api/chat/agent/stream - Agent mode with SSE streaming
 * Streams tool calls and text responses
 */
chatRoutes.post('/agent/stream', async (c) => {
  const tenantId = c.get('tenantId')

  // Parse request body
  let body: AgentChatRequest
  try {
    body = await c.req.json<AgentChatRequest>()
  } catch {
    const response: ApiResponse<null> = {
      success: false,
      error: 'Invalid JSON body',
      timestamp: new Date().toISOString(),
    }
    return c.json(response, 400)
  }

  // Validate messages array
  if (!body.messages || !Array.isArray(body.messages) || body.messages.length === 0) {
    const response: ApiResponse<null> = {
      success: false,
      error: 'Messages array is required and must not be empty',
      timestamp: new Date().toISOString(),
    }
    return c.json(response, 400)
  }

  // Validate sessionId
  if (!body.sessionId) {
    const response: ApiResponse<null> = {
      success: false,
      error: 'sessionId is required for agent mode',
      timestamp: new Date().toISOString(),
    }
    return c.json(response, 400)
  }

  // Validate message limits (DoS prevention)
  const limitsError = validateMessagesLimits(body.messages)
  if (limitsError) {
    const response: ApiResponse<null> = {
      success: false,
      error: limitsError,
      timestamp: new Date().toISOString(),
    }
    return c.json(response, 400)
  }

  try {
    // Create services with tenant context for RLS
    const { rag, tenantService } = await createAgentServices(c.env, tenantId!)
    const claudible = getClaudibleClient(c.env)
    const apiKey = c.env.CLAUDIBLE_API_KEY!

    // Create agent
    const agent = createChatAgent(claudible, rag, tenantService, ShopifyFactory, apiKey)

    return streamSSE(c, async (stream) => {
      try {
        // Stream events from agent
        for await (const event of agent.processMessageStream(
          body.messages as ClaudibleChatMessage[],
          {
            tenantId: tenantId!,
            sessionId: body.sessionId,
            cartId: body.cartId,
          }
        )) {
          await stream.writeSSE({
            event: event.type,
            data: JSON.stringify(event.data),
          })
        }
      } catch (error) {
        // Send error event (sanitized - no internal details)
        console.error('Agent SSE stream error:', error)
        await stream.writeSSE({
          event: 'error',
          data: JSON.stringify({ error: 'An error occurred. Please try again.' }),
        })
      }
    })
  } catch (error) {
    console.error('Agent stream error:', error)
    const response: ApiResponse<null> = {
      success: false,
      error: 'An error occurred. Please try again.',
      timestamp: new Date().toISOString(),
    }
    return c.json(response, 500)
  }
})

export { chatRoutes }
