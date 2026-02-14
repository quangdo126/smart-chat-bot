# Smart Chat Bot Widget - User Guide

Complete guide for embedding and customizing the Smart Chat Bot widget on any website.

## Table of Contents

- [Quick Start](#quick-start)
- [Embed Script](#embed-script)
- [URL Parameters](#url-parameters)
- [Theme Customization](#theme-customization)
- [Color Customization](#color-customization)
- [Example Configurations](#example-configurations)
- [Widget API](#widget-api)
- [Platform Integration](#platform-integration)
- [Troubleshooting](#troubleshooting)

---

## Quick Start

Add this single line to your website's HTML (before closing `</body>` tag):

```html
<script
  src="https://smart-chat-widget.pages.dev/embed.js"
  data-tenant="your-tenant-id"
  data-api="https://smart-chat-bot.quangdo1206.workers.dev">
</script>
```

Replace `your-tenant-id` with your shop's tenant ID. The widget will appear as a floating chat button in the bottom-right corner.

### Required Parameters

| Parameter | Value | Example |
|-----------|-------|---------|
| `data-tenant` | Your shop/tenant identifier | `jesus-loves` |
| `data-api` | API backend URL | `https://smart-chat-bot.quangdo1206.workers.dev` |

---

## Embed Script

### Script Tag Syntax

```html
<script
  src="https://smart-chat-widget.pages.dev/embed.js"
  data-tenant="shop-id"
  data-api="https://api-url.com"
  data-theme="light"
  data-position="bottom-right"
  data-widget-url="https://smart-chat-widget.pages.dev/">
</script>
```

### What the Script Does

1. Creates a floating toggle button in the bottom-right corner (or bottom-left)
2. Renders an iframe containing the chat widget
3. Manages open/close state with smooth animations
4. Handles responsive behavior for mobile devices
5. Exposes `window.SmartChatWidget` API for programmatic control

### Script Behavior

- **Non-blocking**: Uses asynchronous loading (does not block page rendering)
- **Single Instance**: Only one widget per page
- **Responsive**: Adapts to mobile screens automatically
- **CORS-safe**: Works across different domains

---

## URL Parameters

The widget iframe receives parameters as URL query strings. Pass these via the embed script's `data-*` attributes.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `tenant` | string | required | Tenant/shop ID for data isolation |
| `api` | string | required | API endpoint URL |
| `theme` | string | `auto` | `light`, `dark`, or `auto` (system preference) |
| `store` | string | `Shopping Support` | Store name displayed in header |
| `primary` | string | `3B82F6` | Primary color (hex without #) |
| `secondary` | string | `1E40AF` | Secondary color for gradients |
| `accent` | string | `F59E0B` | Accent color for highlights |
| `background` | string | `FFFFFF` | Background color |
| `surface` | string | `F3F4F6` | Surface/content area color |
| `text` | string | `1F2937` | Primary text color |
| `textMuted` | string | `6B7280` | Secondary/muted text color |
| `border` | string | `E5E7EB` | Border color |
| `userBubble` | string | `3B82F6` | User message bubble color |
| `botBubble` | string | `F3F4F6` | Bot message bubble color |
| `radius` | string | `12px` | Border radius for elements |

### How Parameters Work

Parameters are passed through the embed script's `data-` attributes:

```html
<!-- URL that gets built: -->
<!-- https://smart-chat-widget.pages.dev/?tenant=jesus-loves&api=https://...&theme=dark&primary=7C3AED&store=Jesus+Loves -->

<script
  src="https://smart-chat-widget.pages.dev/embed.js"
  data-tenant="jesus-loves"
  data-api="https://smart-chat-bot.quangdo1206.workers.dev"
  data-theme="dark"
  data-primary="7C3AED"
  data-store="Jesus Loves">
</script>
```

---

## Theme Customization

### Theme Modes

The widget supports three theme modes controlled by the `data-theme` attribute:

#### Light Mode
```html
<script
  data-theme="light"
  ...>
</script>
```
- White backgrounds, dark text
- Light gray surfaces
- Optimized for bright environments

#### Dark Mode
```html
<script
  data-theme="dark"
  ...>
</script>
```
- Dark backgrounds, light text
- Dark gray surfaces
- Optimized for low-light environments

#### Auto Mode (Default)
```html
<script
  data-theme="auto"
  ...>
</script>
```
- Detects system preference: `prefers-color-scheme`
- Light mode on light system theme
- Dark mode on dark system theme
- Responsive to system changes in real-time

### How Auto Detection Works

The widget respects the user's operating system theme preference:
- **macOS**: System Preferences > General > Appearance
- **Windows**: Settings > Personalization > Colors
- **iOS**: Settings > Display & Brightness
- **Android**: Settings > Display > Dark theme

---

## Color Customization

### CSS Color Variables

All widget colors are controlled via CSS custom properties (variables). Customize them by passing hex color codes without the `#` prefix.

### Available Color Variables

| Variable | Purpose | Default |
|----------|---------|---------|
| `--chat-primary` | Main brand color, buttons | `3B82F6` (blue) |
| `--chat-secondary` | Secondary color, gradient end | `1E40AF` (dark blue) |
| `--chat-accent` | Highlights, badges, CTAs | `F59E0B` (amber) |
| `--chat-background` | Main background | `FFFFFF` (white) |
| `--chat-surface` | Content area background | `F3F4F6` (light gray) |
| `--chat-text` | Primary text color | `1F2937` (dark gray) |
| `--chat-text-muted` | Secondary/disabled text | `6B7280` (gray) |
| `--chat-border` | Borders, dividers | `E5E7EB` (light gray) |
| `--chat-user-bubble` | User message background | `3B82F6` (primary color) |
| `--chat-bot-bubble` | Bot message background | `F3F4F6` (surface) |

### Hex Color Format

Colors must be specified as 6-character hexadecimal values WITHOUT the `#` prefix:
- Correct: `3B82F6`, `FF0000`, `00FF00`
- Incorrect: `#3B82F6`, `blue`, `rgb(59, 130, 246)`

### Color Picker Tools

Use these tools to find and convert colors:
- [Tailwind Color Picker](https://chir.cat/tw)
- [Color Converter](https://www.rapidtables.com/convert/color/hex-to-rgb.html)
- [Google Color Picker](https://www.google.com/search?q=color%20picker)

---

## Example Configurations

### Blue Theme (Default)

Professional blue palette, suitable for most businesses.

```html
<script
  src="https://smart-chat-widget.pages.dev/embed.js"
  data-tenant="my-store"
  data-api="https://smart-chat-bot.quangdo1206.workers.dev"
  data-primary="3B82F6"
  data-secondary="1E40AF"
  data-accent="F59E0B"
  data-theme="light">
</script>
```

### Purple Theme

Modern, premium look with purple tones.

```html
<script
  src="https://smart-chat-widget.pages.dev/embed.js"
  data-tenant="my-store"
  data-api="https://smart-chat-bot.quangdo1206.workers.dev"
  data-primary="7C3AED"
  data-secondary="5B21B6"
  data-accent="EC4899"
  data-theme="light">
</script>
```

### Green Theme

Fresh, eco-friendly appearance.

```html
<script
  src="https://smart-chat-widget.pages.dev/embed.js"
  data-tenant="my-store"
  data-api="https://smart-chat-bot.quangdo1206.workers.dev"
  data-primary="10B981"
  data-secondary="059669"
  data-accent="F59E0B"
  data-theme="light">
</script>
```

### Red/Orange Theme

Bold, energetic brand presence.

```html
<script
  src="https://smart-chat-widget.pages.dev/embed.js"
  data-tenant="my-store"
  data-api="https://smart-chat-bot.quangdo1206.workers.dev"
  data-primary="EF4444"
  data-secondary="DC2626"
  data-accent="F97316"
  data-theme="light">
</script>
```

### Dark Mode Example

```html
<script
  src="https://smart-chat-widget.pages.dev/embed.js"
  data-tenant="my-store"
  data-api="https://smart-chat-bot.quangdo1206.workers.dev"
  data-theme="dark"
  data-primary="60A5FA"
  data-secondary="3B82F6"
  data-accent="FBBF24">
</script>
```

### Minimal Configuration

Only required parameters, everything else uses defaults:

```html
<script
  src="https://smart-chat-widget.pages.dev/embed.js"
  data-tenant="my-store"
  data-api="https://smart-chat-bot.quangdo1206.workers.dev">
</script>
```

---

## Widget API

### Available Methods

The embed script exposes the `window.SmartChatWidget` object with these methods:

```javascript
// Open the chat widget
window.SmartChatWidget.open()

// Close the chat widget
window.SmartChatWidget.close()

// Toggle open/close state
window.SmartChatWidget.toggle()

// Check if widget is open
const isOpen = window.SmartChatWidget.isOpen()

// Apply theme colors dynamically
window.SmartChatWidget.applyTheme({
  primary: '7C3AED',
  secondary: '5B21B6',
  accent: 'EC4899'
})
```

### Programmatic Control Example

```html
<button onclick="window.SmartChatWidget.open()">Open Chat</button>
<button onclick="window.SmartChatWidget.close()">Close Chat</button>
<button onclick="window.SmartChatWidget.toggle()">Toggle Chat</button>

<script>
  // Check if widget is open on page load
  setTimeout(() => {
    if (window.SmartChatWidget.isOpen()) {
      console.log('Chat is open')
    }
  }, 1000)

  // Change theme on demand
  function switchToPurpleTheme() {
    window.SmartChatWidget.applyTheme({
      primary: '7C3AED',
      secondary: '5B21B6',
      accent: 'EC4899'
    })
  }
</script>
```

---

## Platform Integration

### WordPress

1. Add to theme's `header.php` or `footer.php` before closing body tag:

```php
<script
  src="https://smart-chat-widget.pages.dev/embed.js"
  data-tenant="<?php echo get_option('site_title'); ?>"
  data-api="https://smart-chat-bot.quangdo1206.workers.dev">
</script>
```

2. Or use a custom plugin to inject the script

### Shopify

1. Go to **Themes > Edit code** in Shopify Admin
2. Find `theme.liquid` file
3. Add before closing `</body>` tag:

```liquid
<script
  src="https://smart-chat-widget.pages.dev/embed.js"
  data-tenant="{{ shop.url | split: '.' | first }}"
  data-api="https://smart-chat-bot.quangdo1206.workers.dev">
</script>
```

### Webflow

1. Go to **Project Settings > Custom Code**
2. Add to **Footer Code**:

```html
<script
  src="https://smart-chat-widget.pages.dev/embed.js"
  data-tenant="your-store-id"
  data-api="https://smart-chat-bot.quangdo1206.workers.dev">
</script>
```

### Static HTML

Add the script tag to any HTML page:

```html
<!DOCTYPE html>
<html>
<head>
  <title>My Store</title>
</head>
<body>
  <!-- Your page content -->

  <script
    src="https://smart-chat-widget.pages.dev/embed.js"
    data-tenant="my-store"
    data-api="https://smart-chat-bot.quangdo1206.workers.dev">
  </script>
</body>
</html>
```

### Other Platforms

For any platform with HTML injection capabilities:
1. Find the footer/body injection section
2. Paste the embed script
3. Customize `data-tenant` and `data-api` for your store

---

## Position Options

The widget's floating button position can be controlled:

```html
<!-- Bottom right (default) -->
<script data-position="bottom-right" ...></script>

<!-- Bottom left -->
<script data-position="bottom-left" ...></script>
```

The widget automatically adapts to mobile screens, scaling to nearly full width while maintaining padding.

---

## Responsive Behavior

The widget is fully responsive:

| Breakpoint | Width | Height | Behavior |
|-----------|-------|--------|----------|
| Desktop (>480px) | 380px | 550px | Fixed width, rounded corners |
| Mobile (<480px) | calc(100vw - 20px) | 550px | Full width with margins |

Toggle button remains fixed at 56px diameter on all devices.

---

## Troubleshooting

### Widget Not Loading

**Problem**: Chat widget doesn't appear on page

**Solution**:
1. Check browser console for errors: `F12` > Console tab
2. Verify `data-tenant` and `data-api` attributes are set
3. Ensure script URL is correct and accessible
4. Check firewall/ad blockers aren't blocking the CDN

**Debug Code**:
```javascript
console.log('Tenant:', new URLSearchParams(window.location.search).get('tenant'))
console.log('API:', new URLSearchParams(window.location.search).get('api'))
console.log('Widget available:', window.SmartChatWidget)
```

### CORS Errors

**Problem**: API calls from widget to backend fail with CORS error

**Solution**:
- Backend API must have CORS enabled
- Widget origin must be allowed in API's CORS headers
- Verify `data-api` URL is correct and accessible from browser

### Theme Not Applying

**Problem**: Custom colors aren't showing up

**Solution**:
1. Verify hex color codes are correct (6 characters, no `#` prefix)
2. Hard refresh browser: `Ctrl+Shift+R` (Windows) or `Cmd+Shift+R` (Mac)
3. Check JavaScript console for color parsing errors
4. Ensure color values are valid hex: `0-9`, `A-F`

### Widget Stuck Behind Content

**Problem**: Chat widget appears behind other page elements

**Solution**:
The widget uses `z-index: 9999` (button) and `z-index: 9998` (toggle). If still hidden:
1. Identify conflicting element with `z-index`
2. Reduce that element's z-index value
3. Or contact support if you can't modify page CSS

### API Connection Timeout

**Problem**: Chat messages fail with timeout error

**Solution**:
1. Check API backend is running and accessible
2. Verify `data-api` URL is complete and correct
3. Check network tab in DevTools to see actual request URL
4. Ensure X-Tenant-ID header is being sent correctly

### Widget Opens Automatically

**Problem**: Widget opens when page loads

**Solution**:
This is not default behavior. Check if custom code is calling:
```javascript
window.SmartChatWidget.open()
```
Remove or condition this call if not intended.

---

## Support

For issues or questions:
1. Check this guide's [Troubleshooting](#troubleshooting) section
2. Review integration examples for your platform
3. Verify all URL parameters are correctly formatted
4. Check browser console for detailed error messages

**Version**: 1.0.0
**Last Updated**: February 15, 2026
