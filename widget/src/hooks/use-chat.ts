import { useState, useCallback, useRef } from 'preact/hooks'
import type { Message, Product, SSEMessage } from '../types'

interface UseChatOptions {
  apiUrl: string
  tenantId: string
  turnstileToken?: string | null
}

interface UseChatReturn {
  messages: Message[]
  isLoading: boolean
  cartId: string | null
  checkoutUrl: string | null
  sendMessage: (content: string) => Promise<void>
  clearMessages: () => void
}

export function useChat({ apiUrl, tenantId, turnstileToken }: UseChatOptions): UseChatReturn {
  const [messages, setMessages] = useState<Message[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [cartId, setCartId] = useState<string | null>(null)
  const [checkoutUrl, setCheckoutUrl] = useState<string | null>(null)
  const sessionIdRef = useRef<string>(generateSessionId())
  const abortControllerRef = useRef<AbortController | null>(null)

  const sendMessage = useCallback(async (content: string) => {
    if (!content.trim() || isLoading) return

    const userMessage: Message = {
      id: generateId(),
      role: 'user',
      content: content.trim(),
      timestamp: Date.now()
    }

    setMessages(prev => [...prev, userMessage])
    setIsLoading(true)

    const assistantMessageId = generateId()
    setMessages(prev => [...prev, {
      id: assistantMessageId,
      role: 'assistant',
      content: '',
      timestamp: Date.now()
    }])

    try {
      abortControllerRef.current = new AbortController()

      // Build messages array with conversation history
      const apiMessages = [...messages, userMessage].map(m => ({
        role: m.role,
        content: m.content
      }))

      // Build request headers
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'X-Tenant-ID': tenantId,
      }
      // Include Turnstile token if available
      if (turnstileToken) {
        headers['X-Turnstile-Token'] = turnstileToken
      }

      const response = await fetch(`${apiUrl}/api/chat/agent/stream`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          messages: apiMessages,
          sessionId: sessionIdRef.current
        }),
        signal: abortControllerRef.current.signal
      })

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }

      const reader = response.body?.getReader()
      if (!reader) throw new Error('No response body')

      const decoder = new TextDecoder()
      let buffer = ''
      let fullContent = ''
      let products: Product[] = []
      let currentEventType = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          // Handle SSE event type line
          if (line.startsWith('event: ')) {
            currentEventType = line.slice(7).trim()
            continue
          }

          // Handle SSE data line
          if (line.startsWith('data: ') || line === 'data:') {
            const data = line.slice(6)
            if (data === '[DONE]') continue

            // Process based on event type from agent/stream endpoint
            if (currentEventType) {
              try {
                switch (currentEventType) {
                  case 'text':
                    // Text event data is a JSON string (the actual text chunk)
                    const textChunk = JSON.parse(data) as string
                    fullContent += textChunk
                    setMessages(prev => prev.map(m =>
                      m.id === assistantMessageId
                        ? { ...m, content: fullContent }
                        : m
                    ))
                    break

                  case 'tool':
                    // Tool event contains tool call results
                    const toolData = JSON.parse(data) as { tool: string; result: { success: boolean; data?: unknown } }
                    // Extract products from search_products tool
                    if (toolData.tool === 'search_products' && toolData.result?.success && toolData.result.data) {
                      const searchResult = toolData.result.data as { products?: Product[] }
                      if (searchResult.products) {
                        products = searchResult.products.map(p => ({
                          id: p.id,
                          title: p.title,
                          description: p.description || '',
                          price: p.price,
                          currencyCode: p.currencyCode || 'USD',
                          imageUrl: p.imageUrl || '',
                          productUrl: p.productUrl || '',
                          variantId: p.variantId || ''
                        }))
                        setMessages(prev => prev.map(m =>
                          m.id === assistantMessageId
                            ? { ...m, products }
                            : m
                        ))
                      }
                    }
                    break

                  case 'done':
                    // Done event contains final response with cartId/checkoutUrl
                    const doneData = JSON.parse(data) as { cartId?: string; checkoutUrl?: string }
                    if (doneData.cartId) setCartId(doneData.cartId)
                    if (doneData.checkoutUrl) setCheckoutUrl(doneData.checkoutUrl)
                    break

                  case 'error':
                    const errorMsg = JSON.parse(data) as string | { error?: string }
                    const errText = typeof errorMsg === 'string' ? errorMsg : (errorMsg.error || 'Unknown error')
                    fullContent += `\n\nError: ${errText}`
                    setMessages(prev => prev.map(m =>
                      m.id === assistantMessageId
                        ? { ...m, content: fullContent }
                        : m
                    ))
                    break
                }
              } catch {
                // JSON parse failed, skip this event
              }
              currentEventType = ''
              continue
            }

            // Fallback: no event type - handle as legacy format
            if (data === '' || data.trim() === '') {
              fullContent += '\n'
              setMessages(prev => prev.map(m =>
                m.id === assistantMessageId
                  ? { ...m, content: fullContent }
                  : m
              ))
              continue
            }

            // Try parsing as legacy JSON format
            try {
              const parsed: SSEMessage = JSON.parse(data)

              switch (parsed.type) {
                case 'text':
                  fullContent += parsed.content || ''
                  setMessages(prev => prev.map(m =>
                    m.id === assistantMessageId
                      ? { ...m, content: fullContent }
                      : m
                  ))
                  break

                case 'products':
                  products = parsed.products || []
                  setMessages(prev => prev.map(m =>
                    m.id === assistantMessageId
                      ? { ...m, products }
                      : m
                  ))
                  break

                case 'cart':
                  if (parsed.cartId) setCartId(parsed.cartId)
                  if (parsed.checkoutUrl) setCheckoutUrl(parsed.checkoutUrl)
                  break

                case 'error':
                  fullContent += `\n\nError: ${parsed.content}`
                  setMessages(prev => prev.map(m =>
                    m.id === assistantMessageId
                      ? { ...m, content: fullContent }
                      : m
                  ))
                  break
              }
            } catch {
              // Not JSON - treat as plain text chunk
              fullContent += data
              setMessages(prev => prev.map(m =>
                m.id === assistantMessageId
                  ? { ...m, content: fullContent }
                  : m
              ))
            }
          }
        }
      }
    } catch (error) {
      if ((error as Error).name !== 'AbortError') {
        setMessages(prev => prev.map(m =>
          m.id === assistantMessageId
            ? { ...m, content: 'Sorry, an error occurred. Please try again.' }
            : m
        ))
      }
    } finally {
      setIsLoading(false)
      abortControllerRef.current = null
    }
  }, [apiUrl, tenantId, turnstileToken, cartId, isLoading])

  const clearMessages = useCallback(() => {
    setMessages([])
    sessionIdRef.current = generateSessionId()
  }, [])

  return {
    messages,
    isLoading,
    cartId,
    checkoutUrl,
    sendMessage,
    clearMessages
  }
}

function generateId(): string {
  return Math.random().toString(36).substring(2, 11)
}

function generateSessionId(): string {
  return `session_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`
}
