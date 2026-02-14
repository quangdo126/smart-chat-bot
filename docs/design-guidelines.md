# Smart Chat Bot Widget - Design Guidelines

## Overview

Modern, minimalist chat widget design with customizable theming for e-commerce applications.

## Design Tokens

### Colors (CSS Variables)

```css
:root {
  /* Primary colors - configurable per tenant */
  --chat-primary: #3B82F6;      /* Main brand color */
  --chat-secondary: #1E40AF;    /* Secondary/gradient end */
  --chat-accent: #F59E0B;       /* Highlights, badges, CTAs */

  /* Surface colors */
  --chat-background: #FFFFFF;   /* Main background */
  --chat-surface: #F3F4F6;      /* Chat body, input bg */
  --chat-surface-hover: #E5E7EB;

  /* Text colors */
  --chat-text: #1F2937;         /* Primary text */
  --chat-text-muted: #6B7280;   /* Secondary text */
  --chat-text-inverse: #FFFFFF; /* Text on primary bg */

  /* Borders */
  --chat-border: #E5E7EB;
  --chat-divider: #F3F4F6;

  /* Message bubbles */
  --chat-user-bubble: var(--chat-primary);
  --chat-user-text: #FFFFFF;
  --chat-bot-bubble: #F3F4F6;
  --chat-bot-text: #1F2937;

  /* Status colors */
  --chat-success: #10B981;
  --chat-error: #EF4444;
  --chat-warning: #F59E0B;
}
```

### Typography

- **Font Family**: Inter (Google Fonts) with system fallbacks
- **Font Sizes**:
  - xs: 11px (timestamps, badges)
  - sm: 13px (secondary text)
  - base: 14px (body text)
  - lg: 16px (headers)
  - xl: 18px (welcome title)
- **Font Weights**: 400, 500, 600, 700

### Spacing

- xs: 4px
- sm: 8px
- md: 12px
- lg: 16px
- xl: 24px

### Border Radius

- sm: 8px (buttons, inputs)
- default: 12px (cards, bubbles)
- lg: 16px (widget container)
- full: 9999px (avatars, badges)

### Shadows

- sm: Subtle elevation for bubbles
- md: Cards hover state
- lg: Toggle button
- xl: Widget container

## Components

### Header
- Gradient background (primary to secondary)
- Store avatar with online status indicator
- Store name and status text
- Action buttons (cart, clear)

### Message Bubbles
- User: Gradient background, right-aligned
- Bot: Light surface color, left-aligned, border
- Timestamp appears on hover
- Slide-up animation on appear

### Product Cards
- Image thumbnail with hover scale effect
- Price badge with primary color
- Add to cart button with gradient
- Hover state with border color change

### Chat Input
- Surface background with border
- Focus state with primary border + shadow ring
- Send button with gradient background

### Toggle Button (FAB)
- Gradient background
- Pulse animation when inactive
- Badge for unread messages
- Scale animation on hover/active

## Theming

### URL Parameters

```
?primary=3B82F6&secondary=1E40AF&accent=F59E0B&theme=dark
```

### JavaScript API

```javascript
window.SmartChatWidget.applyTheme({
  primary: '3B82F6',
  secondary: '1E40AF',
  accent: 'F59E0B',
  // ... other tokens
})
```

### Dark Mode

- Auto-detect via `prefers-color-scheme`
- Override via `?theme=dark` or `?theme=light`
- Data attribute: `data-theme="dark"`

## Animations

### Transitions
- fast: 150ms (hover states)
- base: 200ms (default)
- slow: 300ms (complex animations)

### Keyframes
- `slideUp`: Message appear
- `fadeIn`: Welcome screen, typing indicator
- `typingBounce`: Typing dots
- `badgePop`: Badge appear
- `pulse-status`: Online indicator
- `togglePulse`: FAB attention pulse

## Accessibility

### WCAG 2.1 AA Compliance
- Color contrast ratios meet 4.5:1 for text
- Focus visible states with outline
- ARIA labels on interactive elements
- Reduced motion support via media query

### Touch Targets
- Minimum 44x44px for mobile
- 36px header buttons
- 40px send button

## Responsive Design

### Mobile (< 480px)
- Full screen chat window
- Smaller toggle button (56px)
- No border radius on window

### Desktop
- 380px width, 600px max height
- Fixed position bottom-right
- Border radius on window

## File Structure

```
widget/src/
├── styles.css              # CSS with design tokens
├── main.tsx                # Theme loading from URL
├── app.tsx                 # Main app component
├── types.ts                # TypeScript interfaces
├── hooks/
│   ├── use-chat.ts         # Chat state management
│   └── use-sse.ts          # SSE connection
└── components/
    ├── chat-header.tsx     # Header with avatar/actions
    ├── chat-messages.tsx   # Messages container
    ├── chat-bubble.tsx     # Individual message
    ├── chat-input.tsx      # Input with send button
    ├── product-card.tsx    # Product display
    ├── cart-button.tsx     # Cart/checkout button
    ├── typing-indicator.tsx # Typing dots
    └── toggle-button.tsx   # FAB toggle
```

## Bundle Size

- JavaScript: ~24 KB (gzip: ~9.5 KB)
- CSS: ~16 KB (gzip: ~3.4 KB)
- Total: ~40 KB (under 64 KB limit)
