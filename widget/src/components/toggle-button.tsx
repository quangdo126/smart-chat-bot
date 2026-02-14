interface ToggleButtonProps {
  isOpen: boolean
  onClick: () => void
  unreadCount?: number
  pulse?: boolean
}

export function ToggleButton({ isOpen, onClick, unreadCount = 0, pulse = false }: ToggleButtonProps) {
  const buttonClass = [
    'chat-toggle-btn',
    isOpen ? 'chat-toggle-btn--close' : 'chat-toggle-btn--open',
    pulse && !isOpen ? 'chat-toggle-btn--pulse' : '',
  ].filter(Boolean).join(' ')

  return (
    <button
      class={buttonClass}
      onClick={onClick}
      aria-label={isOpen ? 'Close chat' : 'Open chat'}
      aria-expanded={isOpen}
    >
      {isOpen ? (
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      ) : (
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
      )}
      {!isOpen && unreadCount > 0 && (
        <span class="chat-toggle-badge">{unreadCount > 99 ? '99+' : unreadCount}</span>
      )}
    </button>
  )
}
