# apex-sandbox-api — Deployment Steps

## Quick deploy

```bash
git clone https://github.com/xiaunknown116-del/apex-sandbox-api.git
cd apex-sandbox-api
npm install

npx wrangler kv namespace create SANDBOX_KV
npx wrangler kv namespace create RATE_LIMIT_KV
# paste ids into wrangler.toml

# Production: use real Turnstile secret from Cloudflare dashboard
# Demo/local only: 1x0000000000000000000000000000000AA (always passes)
npx wrangler secret put TURNSTILE_SECRET_KEY
npx wrangler secret put ADMIN_TOKEN

npx wrangler deploy
```

Attach custom domain **`api.apexcapitalweb.com`** under Worker → Triggers / Custom Domains.

## Demo Turnstile keys (official Cloudflare test keys)

| Role | Value | Behavior |
|------|-------|----------|
| Sitekey | `1x00000000000000000000AA` | Always passes (visible) |
| Secret | `1x0000000000000000000000000000000AA` | Always passes validation |

**Never use test keys in production** — they provide no bot protection.

Public site currently ships the test sitekey for demos; swap both sitekey and secret before go-live.

## Routes

| Method | Path | Purpose |
|--------|------|--------|
| GET | `/api/health` | Health + KV check |
| POST | `/api/contact` | Rate limit → Turnstile → store inquiry |
| POST | `/api/admin/wipe` | Admin token gated sandbox flag |

## Full platform steps

https://github.com/xiaunknown116-del/apex-public-site/blob/main/DEPLOY.md
