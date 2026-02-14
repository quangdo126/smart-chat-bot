import { useCallback, useRef } from 'preact/hooks'

interface UseSSEOptions {
  onMessage: (data: string) => void
  onError?: (error: Error) => void
  onDone?: () => void
}

interface UseSSEReturn {
  connect: (url: string, body: unknown) => Promise<void>
  disconnect: () => void
  isConnected: boolean
}

export function useSSE({ onMessage, onError, onDone }: UseSSEOptions): UseSSEReturn {
  const abortControllerRef = useRef<AbortController | null>(null)
  const isConnectedRef = useRef(false)

  const connect = useCallback(async (url: string, body: unknown) => {
    if (isConnectedRef.current) {
      abortControllerRef.current?.abort()
    }

    abortControllerRef.current = new AbortController()
    isConnectedRef.current = true

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'text/event-stream'
        },
        body: JSON.stringify(body),
        signal: abortControllerRef.current.signal
      })

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }

      const reader = response.body?.getReader()
      if (!reader) throw new Error('No response body')

      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6)
            if (data === '[DONE]') {
              onDone?.()
            } else {
              onMessage(data)
            }
          }
        }
      }

      onDone?.()
    } catch (error) {
      if ((error as Error).name !== 'AbortError') {
        onError?.(error as Error)
      }
    } finally {
      isConnectedRef.current = false
      abortControllerRef.current = null
    }
  }, [onMessage, onError, onDone])

  const disconnect = useCallback(() => {
    abortControllerRef.current?.abort()
    isConnectedRef.current = false
  }, [])

  return {
    connect,
    disconnect,
    isConnected: isConnectedRef.current
  }
}
