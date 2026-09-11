**Complete fix shipped**
**Apex Capital website is complete and running.**

### Local server
```bash
cd apex-capital-complete/website
python3 -m http.server 8080
```
→ **http://localhost:8080/**

Status: **200 OK** (server active).

### Completed structure
```
apex-capital-complete/website/
├── index.html              (Overview – hero, posture, segregation)
├── platform.html           (Architecture & design principles)
├── portfolio.html          (Illustrative posture only)
├── governance.html         (Dual-control / 4-eye / break-glass)
├── security.html           (Control-plane isolation, audit, Zero Trust)
├── insights.html           (Institutional perspectives)
├── contact.html            (Form → api.apexcapitalweb.com + Turnstile)
├── privacy.html
├── terms.html
├── admin-login.html        (Staff boundary – no credentials collected)
├── google_maps_list_explorer.html
├── assets/
│   ├── site.css            (Dark institutional theme)
│   ├── segregation-diagram.svg
│   ├── control-plane.svg
│   ├── apex-portfolio-overview.jpg
│   └── control-plane.jpg
└── …
```

### Production references (as provided)
| Resource | URL |
|----------|-----|
| Public site | https://apexcapitalweb.com |
| Pages preview | https://apex-capital-web.pages.dev |
| Contact API | https://api.apexcapitalweb.com/api/contact |
| Bot protection | [Cloudflare Turnstile](https://www.cloudflare.com/products/turnstile/?utm_source=turnstile&utm_campaign=widget) |

The contact form is wired to the production API endpoint and includes a Turnstile placeholder (replace the site key with the live value from the Cloudflare dashboard).

### Next recommended steps
1. Configure the real Turnstile site key in `contact.html`.
2. Deploy the `website/` folder to Cloudflare Pages (or Netlify) under `apexcapitalweb.com`.
3. Protect `/admin-login.html` (and any future admin routes) with Cloudflare Access + MFA.
4. Keep the control-plane UI and MCP server completely separate from this public static site.

The local server remains available at **http://localhost:8080**.
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
