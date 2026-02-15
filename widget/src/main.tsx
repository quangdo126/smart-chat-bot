import { render } from 'preact'
import { App } from './app'
import './styles.css'

// Parse URL parameters
const params = new URLSearchParams(window.location.search)
const tenantId = params.get('tenant') || ''
const apiUrl = params.get('api') || 'https://smart-chat-bot.quangdo1206.workers.dev'
// Turnstile site key (optional - if not provided, CAPTCHA is disabled)
const turnstileSiteKey = params.get('turnstile') || null

// Theme configuration interface
interface ThemeConfig {
  primary?: string
  secondary?: string
  accent?: string
  background?: string
  surface?: string
  text?: string
  textMuted?: string
  border?: string
  userBubble?: string
  botBubble?: string
  radius?: string
}

/**
 * Apply theme colors from URL params or config object
 * Colors should be hex values without # prefix (e.g., 3B82F6)
 */
function applyTheme(config: ThemeConfig): void {
  const root = document.documentElement

  // Map config keys to CSS variable names
  const cssVarMap: Record<keyof ThemeConfig, string> = {
    primary: '--chat-primary',
    secondary: '--chat-secondary',
    accent: '--chat-accent',
    background: '--chat-background',
    surface: '--chat-surface',
    text: '--chat-text',
    textMuted: '--chat-text-muted',
    border: '--chat-border',
    userBubble: '--chat-user-bubble',
    botBubble: '--chat-bot-bubble',
    radius: '--chat-radius',
  }

  Object.entries(config).forEach(([key, value]) => {
    if (value && cssVarMap[key as keyof ThemeConfig]) {
      const cssVar = cssVarMap[key as keyof ThemeConfig]
      // Add # prefix for color values, handle radius separately
      const cssValue = key === 'radius' ? value : `#${value}`
      root.style.setProperty(cssVar, cssValue)
    }
  })
}

/**
 * Parse theme from URL params
 * Example: ?primary=3B82F6&secondary=1E40AF&accent=F59E0B
 */
function parseThemeFromParams(params: URLSearchParams): ThemeConfig {
  const theme: ThemeConfig = {}

  const paramMap: Record<string, keyof ThemeConfig> = {
    primary: 'primary',
    secondary: 'secondary',
    accent: 'accent',
    background: 'background',
    surface: 'surface',
    text: 'text',
    textMuted: 'textMuted',
    border: 'border',
    userBubble: 'userBubble',
    botBubble: 'botBubble',
    radius: 'radius',
  }

  Object.entries(paramMap).forEach(([param, key]) => {
    const value = params.get(param)
    if (value) {
      theme[key] = value
    }
  })

  return theme
}

/**
 * Handle theme mode preference
 * Priority: URL param > system preference
 */
function handleThemeMode(params: URLSearchParams): void {
  const themeParam = params.get('theme')

  if (themeParam === 'dark') {
    document.documentElement.setAttribute('data-theme', 'dark')
  } else if (themeParam === 'light') {
    document.documentElement.setAttribute('data-theme', 'light')
  } else {
    // No theme param - apply system preference via data-theme attribute
    // This ensures consistent behavior across browsers
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
    document.documentElement.setAttribute('data-theme', prefersDark ? 'dark' : 'light')

    // Listen for system preference changes
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
      // Only update if no explicit theme param was set
      if (!params.get('theme')) {
        document.documentElement.setAttribute('data-theme', e.matches ? 'dark' : 'light')
      }
    })
  }
}

// Apply theme from URL params
const themeConfig = parseThemeFromParams(params)
if (Object.keys(themeConfig).length > 0) {
  applyTheme(themeConfig)
}

// Handle theme mode
handleThemeMode(params)

// Store name from params (optional)
const storeName = params.get('store') || 'Shopping Support'

// Render the app
render(
  <App
    tenantId={tenantId}
    apiUrl={apiUrl}
    storeName={storeName}
    turnstileSiteKey={turnstileSiteKey}
  />,
  document.getElementById('app')!
)

// Export applyTheme for external usage (e.g., from parent window)
declare global {
  interface Window {
    SmartChatWidget: {
      applyTheme: (config: ThemeConfig) => void
    }
  }
}

window.SmartChatWidget = {
  applyTheme,
}
