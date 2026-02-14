# Phase 5: Universal Iframe Widget (Cloudflare Pages)

## Context Links
- [Plan Overview](plan.md)
- [Shopify Integration Report](../reports/researcher-260215-0128-shopify-integration.md)

## Overview
- **Priority:** P1 - Critical
- **Status:** pending
- **Effort:** 6h

Build universal chat widget embeddable on ANY website (Next.js, WordPress, Shopify, etc) via simple script tag. Widget runs in iframe hosted on Cloudflare Pages for security isolation.

## Key Insights
- **Iframe approach**: Security isolation, no CSS conflicts, works everywhere
- **Embed script**: Tiny loader (~2KB) creates iframe pointing to Cloudflare Pages
- **Multi-tenant**: Widget passes `data-tenant` attribute to iframe
- **Cloudflare Pages**: Free hosting, global CDN, auto-deploy from Git

## Embed Usage (for website owners)

```html
<!-- Paste this before </body> on any website -->
<script
  src="https://widget.smartchat.example/embed.js"
  data-tenant="shop-abc"
  data-position="bottom-right"
  async
></script>
```

## Architecture

```
[Any Website]
    ↓ loads embed.js (~2KB)
[Embed Script]
    ↓ creates iframe
[Iframe src="https://widget.smartchat.example/?tenant=shop-abc"]
    ↓ React app loads
[Cloudflare Pages (Widget App)]
    ↓ API calls with X-Tenant-ID header
[Cloudflare Workers API]
```

## File Structure

```
widget/                          # React app for Cloudflare Pages
├── src/
│   ├── main.tsx                 # Entry point
│   ├── App.tsx                  # Main app
│   ├── components/
│   │   ├── ChatWindow.tsx
│   │   ├── MessageList.tsx
│   │   ├── MessageInput.tsx
│   │   ├── ProductCard.tsx
│   │   └── LoadingDots.tsx
│   ├── hooks/
│   │   └── use-chat.ts
│   └── styles/
│       └── widget.css
├── public/
│   └── embed.js                 # Embed script for websites
├── vite.config.ts
├── package.json
└── wrangler.toml                # Cloudflare Pages config

## Requirements

### Functional
- Embed via single script tag
- Works on Next.js, WordPress, Shopify, any HTML page
- Chat bubble launcher (toggle iframe visibility)
- Streaming message display
- Product cards with "Add to Cart"
- Checkout redirect to Shopify

### Non-Functional
- Embed script <3KB
- Widget app <100KB gzipped
- First paint <200ms
- Mobile responsive
- No CSS conflicts with host site

## Implementation Steps

### 1. Embed Script (45min)
```javascript
// widget/public/embed.js
// Tiny loader that creates iframe - hosted alongside widget
(function() {
  'use strict';

  // Get config from script tag
  var script = document.currentScript;
  var tenant = script.getAttribute('data-tenant');
  var position = script.getAttribute('data-position') || 'bottom-right';
  var apiUrl = script.getAttribute('data-api') || 'https://api.smartchat.example';

  if (!tenant) {
    console.error('[SmartChat] Missing data-tenant attribute');
    return;
  }

  // Widget base URL (same origin as embed.js)
  var widgetUrl = script.src.replace('/embed.js', '/');

  // Create container
  var container = document.createElement('div');
  container.id = 'smartchat-widget-container';
  container.style.cssText = 'position:fixed;z-index:2147483647;' +
    (position === 'bottom-left' ? 'bottom:20px;left:20px;' : 'bottom:20px;right:20px;');

  // Create toggle button
  var button = document.createElement('button');
  button.id = 'smartchat-toggle';
  button.setAttribute('aria-label', 'Chat');
  button.style.cssText = 'width:56px;height:56px;border-radius:50%;border:none;' +
    'background:#3B82F6;color:#fff;cursor:pointer;box-shadow:0 4px 12px rgba(0,0,0,0.15);' +
    'display:flex;align-items:center;justify-content:center;';
  button.innerHTML = '<svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">' +
    '<path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H6l-2 2V4h16v12z"/></svg>';

  // Create iframe (hidden by default)
  var iframe = document.createElement('iframe');
  iframe.id = 'smartchat-iframe';
  iframe.src = widgetUrl + '?tenant=' + encodeURIComponent(tenant) +
    '&api=' + encodeURIComponent(apiUrl);
  iframe.style.cssText = 'display:none;width:380px;height:520px;border:none;' +
    'border-radius:16px;box-shadow:0 8px 32px rgba(0,0,0,0.15);margin-bottom:12px;';
  iframe.setAttribute('allow', 'clipboard-write');

  // Toggle visibility
  var isOpen = false;
  button.addEventListener('click', function() {
    isOpen = !isOpen;
    iframe.style.display = isOpen ? 'block' : 'none';
    button.innerHTML = isOpen
      ? '<svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>'
      : '<svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H6l-2 2V4h16v12z"/></svg>';
  });

  // Mobile responsive
  if (window.innerWidth <= 420) {
    iframe.style.width = 'calc(100vw - 40px)';
    iframe.style.height = 'calc(100vh - 120px)';
  }

  // Append
  container.appendChild(iframe);
  container.appendChild(button);
  document.body.appendChild(container);
})();
```

### 2. Widget Project Setup (30min)
```bash
cd widget
npm init -y
npm install preact
npm install -D vite @preact/preset-vite typescript
```

```json
// widget/package.json
{
  "name": "smart-chat-widget",
  "private": true,
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview",
    "deploy": "wrangler pages deploy dist"
  },
  "dependencies": {
    "preact": "^10.19.0"
  },
  "devDependencies": {
    "@preact/preset-vite": "^2.8.0",
    "typescript": "^5.3.0",
    "vite": "^5.0.0",
    "wrangler": "^3.0.0"
  }
}
```

### 3. Vite Configuration for Cloudflare Pages (20min)
```typescript
// widget/vite.config.ts
import { defineConfig } from 'vite'
import preact from '@preact/preset-vite'

export default defineConfig({
  plugins: [preact()],
  build: {
    outDir: 'dist',
    // Cloudflare Pages serves from dist/
    rollupOptions: {
      output: {
        // No hashes for predictable URLs
        entryFileNames: 'assets/widget.js',
        chunkFileNames: 'assets/[name].js',
        assetFileNames: 'assets/[name].[ext]'
      }
    },
    minify: 'terser',
    terserOptions: {
      compress: { drop_console: true }
    }
  },
  define: {
    'process.env.NODE_ENV': '"production"'
  }
})
```

### 4. Entry Point - Read tenant from URL (20min)
```tsx
// widget/src/main.tsx
import { render } from 'preact'
import { App } from './App'
import './styles/widget.css'

function init() {
  const params = new URLSearchParams(window.location.search)
  const tenant = params.get('tenant')
  const apiUrl = params.get('api') || 'https://api.smartchat.example'

  if (!tenant) {
    console.error('[SmartChat] Missing tenant parameter')
    return
  }

  const config = {
    tenantId: tenant,
    apiUrl
  }

  render(<App config={config} />, document.getElementById('app')!)
}

init()
```

### 5. Main App Component (30min)
```tsx
// widget/src/App.tsx
import { ChatWindow } from './components/ChatWindow'

export interface WidgetConfig {
  tenantId: string
  apiUrl: string
}

interface AppProps {
  config: WidgetConfig
}

export function App({ config }: AppProps) {
  // Widget is always "open" inside iframe
  // Toggle is handled by embed.js
  return <ChatWindow config={config} />
}
```

### 6. Chat Hook with SSE (Multi-tenant) (1h)
```typescript
// widget/src/hooks/use-chat.ts
import { useState, useCallback, useRef } from 'preact/hooks'
import type { WidgetConfig } from '../App'

export interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  products?: ProductCard[]
  actions?: ChatAction[]
}

export interface ProductCard {
  id: string
  title: string
  price: string
  image?: string
  variantId: string
}

export interface ChatAction {
  type: 'add_to_cart' | 'checkout'
  label: string
  variantId?: string
  url?: string
}

interface UseChatReturn {
  messages: Message[]
  isLoading: boolean
  cartId: string | null
  checkoutUrl: string | null
  sendMessage: (content: string) => Promise<void>
  executeAction: (action: ChatAction) => Promise<void>
}

export function useChat(config: WidgetConfig): UseChatReturn {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'welcome',
      role: 'assistant',
      content: 'Xin chào! Tôi có thể giúp gì cho bạn?'
    }
  ])
  const [isLoading, setIsLoading] = useState(false)
  const [conversationId, setConversationId] = useState<string | null>(null)
  const [cartId, setCartId] = useState<string | null>(null)
  const [checkoutUrl, setCheckoutUrl] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  const sendMessage = useCallback(async (content: string) => {
    if (!content.trim() || isLoading) return

    const userMessage: Message = {
      id: `user-${Date.now()}`,
      role: 'user',
      content
    }
    setMessages(prev => [...prev, userMessage])
    setIsLoading(true)

    const assistantId = `assistant-${Date.now()}`
    setMessages(prev => [...prev, {
      id: assistantId,
      role: 'assistant',
      content: ''
    }])

    try {
      abortRef.current = new AbortController()

      const response = await fetch(`${config.apiUrl}/api/chat/stream`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Tenant-ID': config.tenantId  // <-- Multi-tenant header
        },
        body: JSON.stringify({
          message: content,
          conversationId,
          cartId
        }),
        signal: abortRef.current.signal
      })

      if (!response.ok) {
        throw new Error('Chat request failed')
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
            const data = JSON.parse(line.slice(6))

            if (data.conversationId) {
              setConversationId(data.conversationId)
            }

            if (data.text) {
              setMessages(prev => prev.map(m =>
                m.id === assistantId
                  ? { ...m, content: m.content + data.text }
                  : m
              ))
            }

            if (data.products) {
              setMessages(prev => prev.map(m =>
                m.id === assistantId
                  ? { ...m, products: data.products }
                  : m
              ))
            }

            if (data.cartId) {
              setCartId(data.cartId)
            }

            if (data.checkoutUrl) {
              setCheckoutUrl(data.checkoutUrl)
            }
          }
        }
      }
    } catch (error) {
      if ((error as Error).name === 'AbortError') return

      setMessages(prev => prev.map(m =>
        m.id === assistantId
          ? { ...m, content: 'Xin lỗi, đã có lỗi xảy ra. Vui lòng thử lại.' }
          : m
      ))
    } finally {
      setIsLoading(false)
      abortRef.current = null
    }
  }, [config, conversationId, cartId, isLoading])

  const executeAction = useCallback(async (action: ChatAction) => {
    // Checkout: redirect to Shopify
    if (action.type === 'checkout' && action.url) {
      window.top?.location.assign(action.url)  // Break out of iframe
      return
    }

    // Add to cart
    if (action.type === 'add_to_cart' && action.variantId) {
      setIsLoading(true)
      try {
        const response = await fetch(`${config.apiUrl}/api/cart/add`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Tenant-ID': config.tenantId
          },
          body: JSON.stringify({
            variantId: action.variantId,
            cartId
          })
        })
        const data = await response.json()

        if (data.cartId) {
          setCartId(data.cartId)
        }
        if (data.checkoutUrl) {
          setCheckoutUrl(data.checkoutUrl)
        }

        setMessages(prev => [...prev, {
          id: `system-${Date.now()}`,
          role: 'assistant',
          content: 'Đã thêm vào giỏ hàng!',
          actions: data.checkoutUrl ? [{
            type: 'checkout',
            label: 'Thanh toán',
            url: data.checkoutUrl
          }] : undefined
        }])
      } catch {
        setMessages(prev => [...prev, {
          id: `error-${Date.now()}`,
          role: 'assistant',
          content: 'Không thể thêm vào giỏ. Vui lòng thử lại.'
        }])
      } finally {
        setIsLoading(false)
      }
    }
  }, [config, cartId])

  return { messages, isLoading, cartId, checkoutUrl, sendMessage, executeAction }
}
```

### 7. Chat Window Component (Iframe version) (45min)
```tsx
// widget/src/components/ChatWindow.tsx
import { useRef, useEffect } from 'preact/hooks'
import { useChat, Message, ProductCard, ChatAction } from '../hooks/use-chat'
import { MessageInput } from './MessageInput'
import { LoadingDots } from './LoadingDots'
import type { WidgetConfig } from '../App'

interface ChatWindowProps {
  config: WidgetConfig
}

export function ChatWindow({ config }: ChatWindowProps) {
  const { messages, isLoading, checkoutUrl, sendMessage, executeAction } = useChat(config)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  return (
    <div class="scw-window">
      <header class="scw-header">
        <span>Chat hỗ trợ</span>
        {checkoutUrl && (
          <a href={checkoutUrl} target="_top" class="scw-checkout-link">
            Thanh toán
          </a>
        )}
      </header>

      <div class="scw-messages">
        {messages.map(msg => (
          <MessageBubble
            key={msg.id}
            message={msg}
            onAction={executeAction}
          />
        ))}
        {isLoading && <LoadingDots />}
        <div ref={messagesEndRef} />
      </div>

      <MessageInput onSend={sendMessage} disabled={isLoading} />
    </div>
  )
}

interface MessageBubbleProps {
  message: Message
  onAction: (action: ChatAction) => void
}

function MessageBubble({ message, onAction }: MessageBubbleProps) {
  const isUser = message.role === 'user'

  return (
    <div class={`scw-message ${isUser ? 'scw-user' : 'scw-assistant'}`}>
      <div class="scw-bubble">
        {message.content}
      </div>

      {message.products && message.products.length > 0 && (
        <div class="scw-products">
          {message.products.map(product => (
            <ProductCardComponent
              key={product.id}
              product={product}
              onAddToCart={() => onAction({
                type: 'add_to_cart',
                label: 'Thêm vào giỏ',
                variantId: product.variantId
              })}
            />
          ))}
        </div>
      )}

      {message.actions && message.actions.length > 0 && (
        <div class="scw-actions">
          {message.actions.map((action, i) => (
            <button
              key={i}
              class="scw-action-btn"
              onClick={() => onAction(action)}
            >
              {action.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

interface ProductCardProps {
  product: ProductCard
  onAddToCart: () => void
}

function ProductCardComponent({ product, onAddToCart }: ProductCardProps) {
  return (
    <div class="scw-product-card">
      {product.image && (
        <img src={product.image} alt={product.title} class="scw-product-img" />
      )}
      <div class="scw-product-info">
        <h4 class="scw-product-title">{product.title}</h4>
        <span class="scw-product-price">{product.price}</span>
      </div>
      <button class="scw-add-btn" onClick={onAddToCart}>
        Thêm vào giỏ
      </button>
    </div>
  )
}
```

### 8. Other Components (30min)
```tsx
// widget/src/components/MessageInput.tsx
import { useState, useCallback } from 'preact/hooks'

interface MessageInputProps {
  onSend: (message: string) => void
  disabled: boolean
}

export function MessageInput({ onSend, disabled }: MessageInputProps) {
  const [value, setValue] = useState('')

  const handleSubmit = useCallback((e: Event) => {
    e.preventDefault()
    if (value.trim() && !disabled) {
      onSend(value)
      setValue('')
    }
  }, [value, disabled, onSend])

  return (
    <form class="scw-input-form" onSubmit={handleSubmit}>
      <input
        type="text"
        class="scw-input"
        value={value}
        onInput={(e) => setValue((e.target as HTMLInputElement).value)}
        placeholder="Nhập tin nhắn..."
        disabled={disabled}
      />
      <button
        type="submit"
        class="scw-send-btn"
        disabled={disabled || !value.trim()}
      >
        Gửi
      </button>
    </form>
  )
}
```

```tsx
// widget/src/components/LoadingDots.tsx
export function LoadingDots() {
  return (
    <div class="scw-message scw-assistant">
      <div class="scw-bubble scw-loading">
        <span class="scw-dot"></span>
        <span class="scw-dot"></span>
        <span class="scw-dot"></span>
      </div>
    </div>
  )
}
```

### 9. Widget Styles (Iframe-safe) (30min)
```css
/* widget/src/styles/widget.css */
* {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

html, body, #app {
  height: 100%;
  width: 100%;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
}

.scw-window {
  height: 100%;
  width: 100%;
  display: flex;
  flex-direction: column;
  background: white;
  border-radius: 16px;
  overflow: hidden;
}

.scw-header {
  padding: 16px;
  background: #3B82F6;
  color: white;
  font-weight: 600;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.scw-checkout-link {
  background: white;
  color: #3B82F6;
  padding: 6px 12px;
  border-radius: 6px;
  text-decoration: none;
  font-size: 13px;
  font-weight: 500;
}

.scw-messages {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.scw-message {
  display: flex;
  flex-direction: column;
  max-width: 85%;
}

.scw-user {
  align-self: flex-end;
}

.scw-assistant {
  align-self: flex-start;
}

.scw-bubble {
  padding: 10px 14px;
  border-radius: 16px;
  line-height: 1.4;
  word-wrap: break-word;
}

.scw-user .scw-bubble {
  background: #3B82F6;
  color: white;
  border-bottom-right-radius: 4px;
}

.scw-assistant .scw-bubble {
  background: #F3F4F6;
  color: #1F2937;
  border-bottom-left-radius: 4px;
}

.scw-loading {
  display: flex;
  gap: 4px;
  padding: 12px 16px;
}

.scw-dot {
  width: 8px;
  height: 8px;
  background: #9CA3AF;
  border-radius: 50%;
  animation: scw-bounce 1.4s infinite ease-in-out;
}

.scw-dot:nth-child(1) { animation-delay: -0.32s; }
.scw-dot:nth-child(2) { animation-delay: -0.16s; }

@keyframes scw-bounce {
  0%, 80%, 100% { transform: scale(0.6); }
  40% { transform: scale(1); }
}

.scw-products {
  display: flex;
  gap: 8px;
  overflow-x: auto;
  padding: 8px 0;
  margin-top: 8px;
}

.scw-product-card {
  min-width: 140px;
  background: white;
  border: 1px solid #E5E7EB;
  border-radius: 8px;
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.scw-product-img {
  width: 100%;
  height: 80px;
  object-fit: cover;
  border-radius: 4px;
}

.scw-product-title {
  font-size: 13px;
  font-weight: 500;
  color: #1F2937;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.scw-product-price {
  font-size: 14px;
  font-weight: 600;
  color: #3B82F6;
}

.scw-add-btn {
  background: #3B82F6;
  color: white;
  border: none;
  padding: 6px 10px;
  border-radius: 4px;
  font-size: 12px;
  cursor: pointer;
}

.scw-actions {
  display: flex;
  gap: 8px;
  margin-top: 8px;
}

.scw-action-btn {
  background: #10B981;
  color: white;
  border: none;
  padding: 8px 16px;
  border-radius: 6px;
  font-size: 13px;
  cursor: pointer;
}

.scw-input-form {
  display: flex;
  gap: 8px;
  padding: 12px;
  border-top: 1px solid #E5E7EB;
}

.scw-input {
  flex: 1;
  padding: 10px 14px;
  border: 1px solid #E5E7EB;
  border-radius: 20px;
  outline: none;
  font-size: 14px;
}

.scw-input:focus {
  border-color: #3B82F6;
}

.scw-send-btn {
  background: #3B82F6;
  color: white;
  border: none;
  padding: 10px 16px;
  border-radius: 20px;
  font-size: 14px;
  cursor: pointer;
}

.scw-send-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
```

### 10. Cloudflare Pages Deployment (20min)
```toml
# widget/wrangler.toml
name = "smartchat-widget"
compatibility_date = "2026-02-01"

[site]
bucket = "./dist"
```

```bash
# Deploy to Cloudflare Pages
cd widget
npm run build
npx wrangler pages deploy dist --project-name=smartchat-widget
```

### 11. HTML Template (10min)
```html
<!-- widget/index.html -->
<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Smart Chat Widget</title>
</head>
<body>
  <div id="app"></div>
  <script type="module" src="/src/main.tsx"></script>
</body>
</html>
```

## Todo List
- [ ] Create `widget/public/embed.js` (tiny loader)
- [ ] Initialize widget project with Preact
- [ ] Configure Vite for Cloudflare Pages
- [ ] Create main.tsx (read tenant from URL params)
- [ ] Create App.tsx
- [ ] Create use-chat.ts hook with X-Tenant-ID header
- [ ] Create ChatWindow.tsx
- [ ] Create MessageInput.tsx, LoadingDots.tsx
- [ ] Create widget.css (iframe-safe, full height)
- [ ] Create wrangler.toml for Pages deployment
- [ ] Build and deploy to Cloudflare Pages
- [ ] Test embed script on Next.js site
- [ ] Test embed script on plain HTML page
- [ ] Test checkout redirect breaks out of iframe

## Success Criteria
- Embed script <3KB
- Widget app <100KB gzipped
- Works on Next.js, WordPress, plain HTML
- Chat opens/closes via toggle button
- Messages stream in real-time
- Product cards display with images
- "Add to Cart" works with X-Tenant-ID
- Checkout redirects to Shopify (breaks out of iframe)
- Mobile responsive

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| CORS issues | Medium | High | Configure CORS on API for widget domain |
| Iframe blocked by CSP | Low | High | Document CSP requirements for merchants |
| Checkout redirect blocked | Low | Medium | Use target="_top" or postMessage |
| Style isolation issues | Low | Low | Iframe provides natural isolation |

## Security Considerations
- Iframe provides security isolation from host site
- Validate tenant_id on server side
- Don't expose sensitive data in URL params
- Use HTTPS for all resources
- Sanitize message content (XSS)

## Next Steps
-> [Phase 6: AI Agent Logic](phase-06-ai-agent-logic.md)
