export interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  products?: Product[]
  timestamp: number
}

export interface Product {
  id: string
  title: string
  description: string
  price: string
  currencyCode: string
  imageUrl: string
  productUrl: string
  variantId: string
}

export interface ChatResponse {
  sessionId: string
  cartId?: string
  checkoutUrl?: string
}

export interface SSEMessage {
  type: 'text' | 'products' | 'cart' | 'error' | 'done'
  content?: string
  products?: Product[]
  cartId?: string
  checkoutUrl?: string
}
