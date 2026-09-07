# apex-sandbox-api

Controlled-sandbox Cloudflare Worker for Apex Capital.

**Not production brokerage.** No client money, no custody, no live trading.

## Features

| Route | Behavior |
|-------|----------|
| `GET /api/health` | KV ping; `kv_storage: CONNECTED\|DISCONNECTED\|ERROR`. No filler fields. |
| `POST /api/contact` | Email + message validation; optional KV store |
| `POST /api/admin/wipe` | Timing-safe `x-admin-token`; sets sandbox wipe flag only |
| `OPTIONS *` | CORS preflight for allow-listed origins |

### Security fixes (complete)

- **Timing-safe compare** — fixed 256-byte padded buffers; length mixed into accumulator (no early return on length mismatch alone before work)
- **CORS** — origin allow-list; credentials only when origin matches
- **TypeScript** — `Env` interface; `main = src/index.ts`
- **No** `mining_pool` / `alpaca_routing` in health JSON

## Deploy

```bash
npm install
wrangler kv namespace create SANDBOX_KV
# put id into wrangler.toml
wrangler secret put ADMIN_TOKEN
npm run deploy
```

## Verify

```bash
curl -i https://YOUR_HOST/api/health

curl -i -X POST https://YOUR_HOST/api/contact \
  -H 'content-type: application/json' \
  -d '{"email":"not-an-email"}'

curl -i -X POST https://YOUR_HOST/api/admin/wipe \
  -H 'x-admin-token: wrong'
# expect HTTP 403
```

## Cloudflare Access (lockout checklist)

If `xiaunknown116@gmail.com` cannot reach the site:

1. **Zero Trust → Access → Applications** → open app for `apexcapitalweb.com`
2. Policy **Include** must contain:
   - Emails: `xiaunknown116@gmail.com` **or**
   - IdP group that includes that user
3. **Exclude** must not match that email
4. Save → try **incognito** (clears Access cookies)
5. Optional: separate policy so `GET /api/health` is not behind browser login (service token or public bypass for health only)

## Tests

```bash
npm test
```

Covers `timingSafeEqualString` equal / unequal / length mismatch / empty cases.

## License

Apache-2.0 (sandbox infrastructure sample).
