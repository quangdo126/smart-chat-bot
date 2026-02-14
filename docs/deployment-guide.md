# Deployment Guide

## Overview

Smart Chat Bot uses Cloudflare infrastructure:
- **API**: Cloudflare Workers (wrangler)
- **Widget**: Cloudflare Pages (static hosting)

## Prerequisites

1. [Cloudflare account](https://dash.cloudflare.com/sign-up)
2. [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/install-and-update/) installed
3. Supabase project with database configured
4. Voyage AI API key (free tier available)

## Quick Start

```bash
# 1. Install dependencies
npm install
cd widget && npm install && cd ..

# 2. Login to Cloudflare
wrangler login

# 3. Set secrets
wrangler secret put SUPABASE_URL
wrangler secret put SUPABASE_SERVICE_ROLE_KEY
wrangler secret put VOYAGE_API_KEY

# 4. Deploy
npm run deploy:all
```

## API Deployment (Cloudflare Workers)

### Configuration

The `wrangler.toml` file contains Workers configuration:

```toml
name = "smart-chat-bot"
main = "src/index.ts"
compatibility_date = "2026-02-01"
```

### Environments

| Environment | Command | Description |
|-------------|---------|-------------|
| Development | `npm run dev` | Local development |
| Staging | `npm run deploy:api:staging` | Testing environment |
| Production | `npm run deploy:api:production` | Live deployment |

### Setting Secrets

Secrets are stored securely in Cloudflare and not exposed in code:

```bash
# Required
wrangler secret put SUPABASE_URL
# Enter: https://your-project.supabase.co

wrangler secret put SUPABASE_SERVICE_ROLE_KEY
# Enter: your-service-role-key

wrangler secret put VOYAGE_API_KEY
# Enter: pa-your-voyage-api-key
# Get from: https://dash.voyageai.com/api-keys

# Optional
wrangler secret put CLAUDIBLE_API_KEY
# Enter: your-claudible-api-key
```

For staging environment:
```bash
wrangler secret put SUPABASE_URL --env staging
```

### Deploy Commands

```bash
# Deploy to default environment
npm run deploy:api

# Deploy to staging
npm run deploy:api:staging

# Deploy to production
npm run deploy:api:production
```

## Widget Deployment (Cloudflare Pages)

### First-Time Setup

1. Create Pages project in Cloudflare dashboard, OR
2. First deploy will auto-create the project:

```bash
npm run deploy:widget
```

### Build Configuration

Widget uses Vite for building:
- **Build command**: `npm run build`
- **Output directory**: `dist`
- **Framework preset**: None (vanilla)

### Environment Variables

Set in Cloudflare Pages dashboard (Settings > Environment Variables):

| Variable | Description |
|----------|-------------|
| `VITE_API_URL` | Workers API URL (e.g., `https://smart-chat-bot.workers.dev`) |

### Deploy Commands

```bash
# Deploy widget (preview)
npm run deploy:widget

# Deploy widget (production)
npm run deploy:widget:production
```

## Full Deployment

Deploy both API and widget:

```bash
npm run deploy:all
```

## Domain Configuration

### Custom Domain for Workers

1. Go to Cloudflare Dashboard > Workers & Pages
2. Select your worker > Settings > Triggers
3. Add custom domain (e.g., `api.yourdomain.com`)

### Custom Domain for Pages

1. Go to Cloudflare Dashboard > Workers & Pages
2. Select your Pages project > Custom domains
3. Add domain (e.g., `widget.yourdomain.com`)

## Environment URLs

| Service | Development | Production |
|---------|-------------|------------|
| API | `http://localhost:8787` | `https://smart-chat-bot.workers.dev` |
| Widget | `http://localhost:5173` | `https://smart-chat-widget.pages.dev` |

## Monitoring

### Workers Analytics

- Cloudflare Dashboard > Workers & Pages > Analytics
- Request count, CPU time, errors

### Logs

```bash
# Tail live logs
wrangler tail

# Tail staging logs
wrangler tail --env staging
```

## Troubleshooting

### Common Issues

**1. Deployment fails with authentication error**
```bash
wrangler logout
wrangler login
```

**2. Secrets not found**
```bash
# List secrets
wrangler secret list

# Re-add secret
wrangler secret put SECRET_NAME
```

**3. CORS errors on widget**
- Verify API URL in widget config
- Check Workers CORS headers configuration

**4. Pages deployment fails**
```bash
# Check build locally first
cd widget && npm run build && ls -la dist/
```

## CI/CD Integration

### GitHub Actions Example

```yaml
name: Deploy
on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Install dependencies
        run: npm ci

      - name: Deploy API
        run: npm run deploy:api:production
        env:
          CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}

      - name: Deploy Widget
        run: |
          cd widget && npm ci
          npm run deploy:widget:production
        env:
          CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
```

### Required GitHub Secrets

- `CLOUDFLARE_API_TOKEN`: Create at Cloudflare Dashboard > API Tokens

## Security Checklist

- [ ] All secrets set via `wrangler secret put` (not in code)
- [ ] Production environment uses separate database
- [ ] CORS configured for allowed origins only
- [ ] Rate limiting enabled (optional KV namespace)
- [ ] API keys have appropriate permissions/scopes
