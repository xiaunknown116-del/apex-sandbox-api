# apex-sandbox-api — Deployment Steps

## Quick deploy

```bash
git clone https://github.com/xiaunknown116-del/apex-sandbox-api.git
cd apex-sandbox-api
npm install

npx wrangler kv namespace create SANDBOX_KV
npx wrangler kv namespace create RATE_LIMIT_KV
# paste ids into wrangler.toml

npx wrangler secret put TURNSTILE_SECRET_KEY
npx wrangler secret put ADMIN_TOKEN

npx wrangler deploy
```

Then attach custom domain **`api.apexcapitalweb.com`** in the Worker triggers.

## Routes

| Method | Path | Purpose |
|--------|------|--------|
| GET | `/api/health` | Health + KV check |
| POST | `/api/contact` | Rate limit → Turnstile → store inquiry |
| POST | `/api/admin/wipe` | Admin token gated sandbox flag |

## Full platform steps

See the public site guide:  
https://github.com/xiaunknown116-del/apex-public-site/blob/main/DEPLOY.md
