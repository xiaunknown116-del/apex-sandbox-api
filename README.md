# apex-sandbox-api

Controlled-sandbox Cloudflare Worker for Apex Capital.

**Not production brokerage.** No client money, no custody, no live trading.

**Repo:** https://github.com/xiaunknown116-del/apex-sandbox-api

---

## Features

| Route | Behavior |
|-------|----------|
| `GET /api/health` | KV ping; `kv_storage: CONNECTED\|DISCONNECTED\|ERROR`. No filler fields. |
| `POST /api/contact` | Email + message validation; optional KV store |
| `POST /api/admin/wipe` | Timing-safe `x-admin-token`; sets sandbox wipe flag only |
| `OPTIONS *` | CORS preflight for allow-listed origins |

### Security posture

- **Timing-safe compare** — 256-byte padded buffers; length mixed into accumulator (no early return on length alone)
- **CORS** — origin allow-list; credentials only when origin matches
- **TypeScript** — `Env` interface; `main = src/index.ts`
- **No** `mining_pool` / `alpaca_routing` in health JSON

---

## Quick start (local)

```bash
git clone https://github.com/xiaunknown116-del/apex-sandbox-api.git
cd apex-sandbox-api
npm install
npm run typecheck
npm test
npm run dev
```

---

## One-time Cloudflare setup

```bash
# 1. Create KV and paste the id into wrangler.toml
wrangler kv namespace create SANDBOX_KV

# 2. Set Worker runtime secret (not a GitHub secret)
wrangler secret put ADMIN_TOKEN

# 3. Deploy from your machine (optional if using GitHub Actions Deploy)
npm run deploy
```

`wrangler.toml` must not keep `REPLACE_WITH_KV_NAMESPACE_ID`.

---

## GitHub Actions

### CI — `.github/workflows/ci.yml`

| Trigger | What runs |
|---------|-----------|
| Push / PR → `main` | Install → typecheck → vitest |
| **workflow_dispatch** | Same; optional Node `22` or `24` |

- Node **24** by default
- No Cloudflare secrets required
- Concurrency cancels superseded runs on the same ref

### Deploy — `.github/workflows/deploy.yml`

| Trigger | What runs |
|---------|-----------|
| Push → `main` | Typecheck → test → `wrangler deploy` |
| **workflow_dispatch** | Same (manual production deploy) |

Uses [`cloudflare/wrangler-action@v3`](https://github.com/cloudflare/wrangler-action).

**GitHub → Settings → Secrets and variables → Actions**

| Secret | Required | Purpose |
|--------|----------|---------|
| `CLOUDFLARE_API_TOKEN` | Yes | Workers Edit token |
| `CLOUDFLARE_ACCOUNT_ID` | Recommended | Account scoping |

Optional: repo **Environment** named `production` (reviewers / wait timer).

Deploy does **not** run on pull requests (secrets stay off untrusted code).

### Status checks (branch protection)

**Settings → Rules → Rulesets** (or classic branch protection on `main`):

1. Require pull request before merging  
2. Require status checks to pass → select **CI** / **Test (Node 24)**  
3. Optionally require branch up to date  

---

## Codespaces / Dev Container

`.devcontainer/devcontainer.json`

- Image: `mcr.microsoft.com/devcontainers/typescript-node:24`
- Port **8787** forwarded for `wrangler dev`
- `postCreateCommand`: `npm install`

**Code → Codespaces → Create codespace**

Wrangler OAuth (`wrangler login`) does not work in Codespaces. Use a token:

```bash
export CLOUDFLARE_API_TOKEN=your_token
npx wrangler dev
```

---

## Verify after deploy

```bash
curl -i https://YOUR_HOST/api/health

curl -i -X POST https://YOUR_HOST/api/contact \
  -H 'content-type: application/json' \
  -d '{"email":"not-an-email"}'

curl -i -X POST https://YOUR_HOST/api/admin/wipe \
  -H 'x-admin-token: wrong'
# expect HTTP 403
```

---

## Cloudflare Access (lockout checklist)

If `xiaunknown116@gmail.com` cannot reach the site:

1. **Zero Trust → Access → Applications** → app for `apexcapitalweb.com`
2. Policy **Include** must contain that email (or an IdP group that includes it)
3. **Exclude** must not match that email
4. Save → retry in **incognito**
5. Optional: bypass Access for `GET /api/health` only (service token or public exception)

---

## Tests

```bash
npm test
```

Covers `timingSafeEqualString` (equal / unequal / length mismatch / empty).

---

## Source layout

```
.devcontainer/devcontainer.json   # Codespaces / VS Code Dev Containers
.github/workflows/ci.yml          # PR + push CI
.github/workflows/deploy.yml      # main + manual deploy
src/index.ts                      # Worker entry
tests/                            # Vitest
wrangler.toml                     # Worker name, KV binding, vars
package.json
tsconfig.json
vitest.config.ts
```

---

## License

Apache-2.0 (sandbox infrastructure sample).
