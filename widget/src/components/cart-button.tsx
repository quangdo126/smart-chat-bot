interface CartButtonProps {
  itemCount: number
  checkoutUrl: string | null
  onClick?: () => void
}

export function CartButton({ itemCount, checkoutUrl, onClick }: CartButtonProps) {
  if (!checkoutUrl && itemCount === 0) return null

  const handleClick = () => {
    if (checkoutUrl) {
      window.open(checkoutUrl, '_blank', 'noopener,noreferrer')
    }
    onClick?.()
  }

  return (
    <button
      class="cart-button"
      onClick={handleClick}
      aria-label={`Cart${itemCount > 0 ? ` (${itemCount} items)` : ''}`}
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="9" cy="21" r="1" />
        <circle cx="20" cy="21" r="1" />
        <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
      </svg>
      {itemCount > 0 && <span class="cart-badge">{itemCount}</span>}
      <span class="cart-text">
        {checkoutUrl ? 'Checkout' : 'Cart'}
      </span>
    </button>
  )
}
