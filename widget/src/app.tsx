import { useRef, useEffect } from 'preact/hooks'
import { useChat } from './hooks/use-chat'
import { ChatMessages } from './components/chat-messages'
import { ChatInput } from './components/chat-input'
import { CartButton } from './components/cart-button'
import { ChatHeader } from './components/chat-header'

interface AppProps {
  tenantId: string
  apiUrl: string
  storeName?: string
  storeAvatar?: string
}

export function App({ tenantId, apiUrl, storeName = 'Shopping Support', storeAvatar }: AppProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const {
    messages,
    isLoading,
    cartId,
    checkoutUrl,
    sendMessage,
    clearMessages
  } = useChat({ apiUrl, tenantId })

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const handleClearChat = () => {
    if (confirm('Are you sure you want to clear the conversation?')) {
      clearMessages()
    }
  }

  return (
    <div class="chat-widget">
      <ChatHeader
        storeName={storeName}
        storeAvatar={storeAvatar}
        onClear={handleClearChat}
        cartButton={
          checkoutUrl ? (
            <CartButton
              itemCount={cartId ? 1 : 0}
              checkoutUrl={checkoutUrl}
            />
          ) : null
        }
      />

      <main class="chat-body">
        <ChatMessages messages={messages} isLoading={isLoading} />
        <div ref={messagesEndRef} />
      </main>

      <footer class="chat-footer">
        <ChatInput
          onSend={sendMessage}
          disabled={isLoading}
          placeholder="Type a message..."
        />
      </footer>
    </div>
  )
}
