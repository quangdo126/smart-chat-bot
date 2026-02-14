import type { ComponentChildren } from 'preact'

interface ChatHeaderProps {
  storeName: string
  storeAvatar?: string
  onClear: () => void
  cartButton?: ComponentChildren
}

export function ChatHeader({ storeName, storeAvatar, onClear, cartButton }: ChatHeaderProps) {
  return (
    <header class="chat-header">
      <div class="chat-header-info">
        <div class="chat-avatar">
          {storeAvatar ? (
            <img src={storeAvatar} alt={storeName} />
          ) : (
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
          )}
        </div>
        <div class="chat-title">
          <h1>{storeName}</h1>
          <span class="chat-status">Online</span>
        </div>
      </div>
      <div class="chat-header-actions">
        {cartButton}
        <button
          class="chat-header-btn"
          onClick={onClear}
          title="Clear conversation"
          aria-label="Clear conversation"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="3 6 5 6 21 6" />
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
            <line x1="10" y1="11" x2="10" y2="17" />
            <line x1="14" y1="11" x2="14" y2="17" />
          </svg>
        </button>
      </div>
    </header>
  )
}
