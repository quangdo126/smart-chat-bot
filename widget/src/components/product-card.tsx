import type { Product } from '../types'

interface ProductCardProps {
  product: Product
  onAddToCart?: (variantId: string) => void
}

export function ProductCard({ product, onAddToCart }: ProductCardProps) {
  const handleClick = () => {
    window.open(product.productUrl, '_blank', 'noopener,noreferrer')
  }

  const handleAddToCart = (e: Event) => {
    e.stopPropagation()
    onAddToCart?.(product.variantId)
  }

  return (
    <div
      class="product-card"
      onClick={handleClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && handleClick()}
    >
      <div class="product-image">
        {product.imageUrl ? (
          <img src={product.imageUrl} alt={product.title} loading="lazy" />
        ) : (
          <div class="product-image-placeholder">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
              <circle cx="8.5" cy="8.5" r="1.5" />
              <polyline points="21 15 16 10 5 21" />
            </svg>
          </div>
        )}
      </div>
      <div class="product-info">
        <h4 class="product-title">{product.title}</h4>
        {product.description && (
          <p class="product-description">{product.description}</p>
        )}
        <div class="product-footer">
          <span class="product-price">
            {formatPrice(product.price, product.currencyCode)}
          </span>
          {onAddToCart && (
            <button
              class="product-add-button"
              onClick={handleAddToCart}
              aria-label={`Add ${product.title} to cart`}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              Add
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function formatPrice(price: string, currencyCode: string): string {
  const num = parseFloat(price)
  if (isNaN(num)) return price

  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currencyCode
    }).format(num)
  } catch {
    return `${num.toLocaleString('en-US')} ${currencyCode}`
  }
}
