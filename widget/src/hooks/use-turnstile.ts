/**
 * Turnstile hook for managing invisible CAPTCHA token
 * Handles loading Turnstile script and retrieving tokens
 */

import { useState, useEffect, useCallback, useRef } from 'preact/hooks'

// Turnstile widget interface
interface TurnstileWidget {
  render: (
    container: string | HTMLElement,
    options: {
      sitekey: string
      callback: (token: string) => void
      'error-callback'?: (error: unknown) => void
      'expired-callback'?: () => void
      size?: 'normal' | 'compact' | 'invisible'
      theme?: 'light' | 'dark' | 'auto'
      retry?: 'auto' | 'never'
      'retry-interval'?: number
      'refresh-expired'?: 'auto' | 'manual' | 'never'
    }
  ) => string
  reset: (widgetId?: string) => void
  remove: (widgetId?: string) => void
  getResponse: (widgetId?: string) => string | undefined
}

declare global {
  interface Window {
    turnstile?: TurnstileWidget
    onTurnstileLoad?: () => void
  }
}

interface UseTurnstileOptions {
  siteKey: string | null
}

interface UseTurnstileReturn {
  token: string | null
  isLoading: boolean
  error: string | null
  refreshToken: () => void
}

const TURNSTILE_SCRIPT_URL = 'https://challenges.cloudflare.com/turnstile/v0/api.js'

/**
 * Hook to manage Cloudflare Turnstile invisible CAPTCHA
 */
export function useTurnstile({ siteKey }: UseTurnstileOptions): UseTurnstileReturn {
  const [token, setToken] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const widgetIdRef = useRef<string | null>(null)
  const containerRef = useRef<HTMLDivElement | null>(null)

  /**
   * Initialize Turnstile widget
   */
  const initWidget = useCallback(() => {
    if (!siteKey || !window.turnstile || !containerRef.current) return

    // Remove existing widget if any
    if (widgetIdRef.current) {
      try {
        window.turnstile.remove(widgetIdRef.current)
      } catch {
        // Widget may not exist
      }
    }

    setIsLoading(true)
    setError(null)

    try {
      widgetIdRef.current = window.turnstile.render(containerRef.current, {
        sitekey: siteKey,
        size: 'invisible',
        callback: (newToken: string) => {
          setToken(newToken)
          setIsLoading(false)
        },
        'error-callback': () => {
          setError('CAPTCHA verification failed')
          setIsLoading(false)
        },
        'expired-callback': () => {
          setToken(null)
          // Auto-refresh on expiry
          if (widgetIdRef.current && window.turnstile) {
            window.turnstile.reset(widgetIdRef.current)
          }
        },
        'refresh-expired': 'auto',
        retry: 'auto',
        'retry-interval': 5000,
      })
    } catch (err) {
      setError('Failed to initialize CAPTCHA')
      setIsLoading(false)
      console.error('Turnstile init error:', err)
    }
  }, [siteKey])

  /**
   * Load Turnstile script dynamically
   */
  useEffect(() => {
    // Skip if no site key provided (Turnstile not configured)
    if (!siteKey) {
      return
    }

    // Create hidden container for invisible widget
    if (!containerRef.current) {
      const container = document.createElement('div')
      container.id = 'turnstile-container'
      container.style.cssText = 'position: absolute; visibility: hidden; pointer-events: none;'
      document.body.appendChild(container)
      containerRef.current = container
    }

    // Check if script is already loaded
    if (window.turnstile) {
      initWidget()
      return
    }

    // Check if script is already being loaded
    const existingScript = document.querySelector(`script[src*="turnstile"]`)
    if (existingScript) {
      // Wait for it to load
      window.onTurnstileLoad = initWidget
      return
    }

    setIsLoading(true)

    // Load Turnstile script
    const script = document.createElement('script')
    script.src = `${TURNSTILE_SCRIPT_URL}?onload=onTurnstileLoad`
    script.async = true
    script.defer = true

    window.onTurnstileLoad = initWidget

    script.onerror = () => {
      setError('Failed to load CAPTCHA script')
      setIsLoading(false)
    }

    document.head.appendChild(script)

    // Cleanup
    return () => {
      if (widgetIdRef.current && window.turnstile) {
        try {
          window.turnstile.remove(widgetIdRef.current)
        } catch {
          // Widget may not exist
        }
      }
      if (containerRef.current && containerRef.current.parentNode) {
        containerRef.current.parentNode.removeChild(containerRef.current)
        containerRef.current = null
      }
    }
  }, [siteKey, initWidget])

  /**
   * Refresh token manually
   */
  const refreshToken = useCallback(() => {
    if (widgetIdRef.current && window.turnstile) {
      setIsLoading(true)
      setToken(null)
      window.turnstile.reset(widgetIdRef.current)
    }
  }, [])

  return {
    token,
    isLoading,
    error,
    refreshToken,
  }
}
