import type { Message } from '../types'
import { ProductCard } from './product-card'

interface ChatBubbleProps {
  message: Message
}

/**
 * Format timestamp to readable time string
 */
function formatTime(timestamp: number): string {
  const date = new Date(timestamp)
  return date.toLocaleTimeString('vi-VN', {
    hour: '2-digit',
    minute: '2-digit',
  })
}

/**
 * Lightweight markdown renderer for chat messages
 * Converts basic markdown to HTML without external dependencies
 */
function renderMarkdown(text: string): string {
  if (!text) return ''

  // Escape HTML to prevent XSS
  let html = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')

  // Process lists first (before line break conversion)
  // Split into lines for list processing
  const lines = html.split('\n')
  const processedLines: string[] = []
  let inUnorderedList = false
  let inOrderedList = false

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const trimmedLine = line.trim()
    const unorderedMatch = trimmedLine.match(/^[\-\*]\s+(.+)$/)
    const orderedMatch = trimmedLine.match(/^\d+\.\s+(.+)$/)

    if (unorderedMatch) {
      if (!inUnorderedList) {
        if (inOrderedList) {
          processedLines.push('</ol>')
          inOrderedList = false
        }
        processedLines.push('<ul style="margin:0.5em 0;padding-left:1.5em;list-style-type:disc">')
        inUnorderedList = true
      }
      processedLines.push(`<li>${unorderedMatch[1]}</li>`)
    } else if (orderedMatch) {
      if (!inOrderedList) {
        if (inUnorderedList) {
          processedLines.push('</ul>')
          inUnorderedList = false
        }
        processedLines.push('<ol style="margin:0.5em 0;padding-left:1.5em">')
        inOrderedList = true
      }
      processedLines.push(`<li>${orderedMatch[1]}</li>`)
    } else {
      // Close any open lists
      if (inUnorderedList) {
        processedLines.push('</ul>')
        inUnorderedList = false
      }
      if (inOrderedList) {
        processedLines.push('</ol>')
        inOrderedList = false
      }
      processedLines.push(line)
    }
  }

  // Close any remaining open lists
  if (inUnorderedList) processedLines.push('</ul>')
  if (inOrderedList) processedLines.push('</ol>')

  html = processedLines.join('\n')

  // Convert headings (### > ## > #)
  html = html.replace(/^### (.+)$/gm, '<strong style="font-size:1.1em">$1</strong>')
  html = html.replace(/^## (.+)$/gm, '<strong style="font-size:1.2em">$1</strong>')
  html = html.replace(/^# (.+)$/gm, '<strong style="font-size:1.3em">$1</strong>')

  // Convert bold **text** or __text__ (non-greedy matching)
  html = html.replace(/\*\*([^*]+?)\*\*/g, '<strong>$1</strong>')
  html = html.replace(/__([^_]+?)__/g, '<strong>$1</strong>')

  // Convert italic *text* or _text_ (but not inside words, and not list markers)
  html = html.replace(/(?<![*\w])\*([^*\n]+?)\*(?![*\w])/g, '<em>$1</em>')
  html = html.replace(/(?<![_\w])_([^_\n]+?)_(?![_\w])/g, '<em>$1</em>')

  // Convert inline code `code`
  html = html.replace(/`([^`]+)`/g, '<code style="background:#f0f0f0;padding:0.1em 0.3em;border-radius:3px;font-size:0.9em">$1</code>')

  // Convert line breaks (double newline = paragraph break, single = br)
  // But don't add <br> inside list tags
  html = html.replace(/\n\n+/g, '<br><br>')
  html = html.replace(/\n/g, '<br>')

  // Clean up: remove <br> right after opening list tags and before closing list tags
  html = html.replace(/<ul([^>]*)><br>/g, '<ul$1>')
  html = html.replace(/<ol([^>]*)><br>/g, '<ol$1>')
  html = html.replace(/<br><\/ul>/g, '</ul>')
  html = html.replace(/<br><\/ol>/g, '</ol>')
  html = html.replace(/<\/li><br><li>/g, '</li><li>')
  html = html.replace(/<\/li><br><\/ul>/g, '</li></ul>')
  html = html.replace(/<\/li><br><\/ol>/g, '</li></ol>')

  return html
}

export function ChatBubble({ message }: ChatBubbleProps) {
  const isUser = message.role === 'user'

  return (
    <div class={`chat-bubble-wrapper ${isUser ? 'user' : 'assistant'}`}>
      <div class={`chat-bubble ${isUser ? 'user' : 'assistant'}`}>
        {message.content ? (
          <div
            class="chat-bubble-content"
            dangerouslySetInnerHTML={{ __html: isUser ? message.content : renderMarkdown(message.content) }}
          />
        ) : null}
      </div>

      {message.timestamp && (
        <span class="chat-bubble-time">{formatTime(message.timestamp)}</span>
      )}

      {message.products && message.products.length > 0 && (
        <div class="product-cards">
          {message.products.map(product => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      )}
    </div>
  )
}
