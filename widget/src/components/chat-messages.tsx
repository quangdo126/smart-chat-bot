import type { Message } from '../types'
import { ChatBubble } from './chat-bubble'
import { TypingIndicator } from './typing-indicator'

interface ChatMessagesProps {
  messages: Message[]
  isLoading: boolean
}

export function ChatMessages({ messages, isLoading }: ChatMessagesProps) {
  const showTyping = isLoading && messages.length > 0 && messages[messages.length - 1]?.content === ''

  return (
    <div class="chat-messages">
      {messages.length === 0 && (
        <div class="chat-welcome">
          <div class="chat-welcome-avatar">
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
          </div>
          <h2>Hello!</h2>
          <p>How can I help you today? Ask about products, promotions, or any questions.</p>
        </div>
      )}

      {messages
        .filter(message => message.content || message.role === 'user')
        .map(message => (
          <ChatBubble key={message.id} message={message} />
        ))}

      {showTyping && <TypingIndicator />}
    </div>
  )
}
