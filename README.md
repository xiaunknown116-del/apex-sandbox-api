## Summary
Adds a minimal, fast GitHub Actions CI workflow for `apex-sandbox-api`.

### What it does
- Runs on every push and PR targeting `main`
- Installs dependencies with `npm ci`
- Runs `npm run typecheck` (TypeScript)
- Runs `npm test` (Vitest unit tests, including timing-safe compare)

### Design choices (smallest safe improvement)
- No deploy step — avoids needing Cloudflare secrets in PR CI
- Node 20 + npm cache for speed
- 10-minute job timeout
- Concurrency group cancels superseded runs on the same ref

### Test plan
- [x] Workflow file added at `.github/workflows/ci.yml`
- [ ] CI run on this PR should pass (typecheck + vitest)
- [ ] After merge, pushes to `main` will also run CI

---
Related: controlled-sandbox Worker for Apex Capital (no client money / no production trading).**Complete fix shipped**

**Repo:** https://github.com/xiaunknown116-del/apex-sandbox-api  

```bash
git clone https://github.com/xiaunknown116-del/apex-sandbox-api.git
cd apex-sandbox-api
npm install
```

### What’s fixed

| Item | Fix |
|------|-----|
| **Timing-safe compare** | Fixed 256-byte zero-pad; XOR full buffer; length mixed into accumulator — **no early length return** |
| **Dead ternary** | Single constant-time loop only |
| **CORS** | `OPTIONS` → 204; allow-list origins; credentials only when origin matches |
| **TypeScript** | `Env` interface, typed handlers, `main = src/index.ts` |
| **Health JSON** | No `mining_pool` / `alpaca_routing` |
| **Tests** | `tests/timing-safe.test.ts` (equal, mismatch, length, empty) |
| **Access** | README checklist for `xiaunknown116@gmail.com` include rules |

### Deploy

```bash
wrangler kv namespace create SANDBOX_KV   # paste id into wrangler.toml
wrangler secret put ADMIN_TOKEN
npm run deploy
```

### Prove wipe gate

```bash
curl -i -s -X POST https://YOUR_HOST/api/admin/wipe \
  -H "x-admin-token: wrong"
# expect: HTTP/… 403
```

### Access lockout (still on you in the dashboard)

1. Zero Trust → Access → Applications → policy for `apexcapitalweb.com`  
2. **Include** → `xiaunknown116@gmail.com`  
3. Save → **incognito** retry  

Worker code is complete on `main`. Access can only be fixed in your Cloudflare account.# apex-sandbox-api

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
