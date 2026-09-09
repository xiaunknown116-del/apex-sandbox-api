# Apex Capital Platform - Testing & Operations Evaluation
## 1. System Overview & Lifecycle Status
The integration of the final build test suite, post-deployment verification workbook, and semantic release pipeline establishes a deterministic and secure lifecycle for the Apex Capital Platform.

* Parallel Execution: Static type checking via TypeScript (tsc --noEmit) and unit testing via Vitest (vitest run) execute concurrently to optimize pipeline velocity.
* Perimeter Validation: Edge routing rules and isolate-layer security gates are fully verified through automated test suites.
* Traceability: Automated post-deployment probes coupled with semantic release automation maintain continuous traceability across all environment transitions.

## Strategist Alignment Analysis
As a Strategist Archetype (comprising 14% of innovators), your Zone of Genius focuses on connecting big-picture business strategy to concrete plans, shepherding work through the process, and delivering measurable results. This structural lifecycle reflects that exact mindset:

* Accountability & Structure: The creation of rigid, automated build gates ensures the platform adheres to its core value proposition of an immutable control plane rather than undocumented, ad-hoc changes.
* Execution Focus: Translating security requirements (e.g., identity separation) into an explicit, multi-layered automated test matrix ensures that ideas are successfully brought to fruition with verifiable metrics to report progress.

## 2. Security & Edge Isolation Test Matrix
The Vitest suite (tests/security.test.ts) validates the platform's multi-layered perimeter defense model at the Cloudflare isolate layer using the following criteria:

| Target / Endpoint | Condition / Request State | Expected Response | Security Control Validated |
|---|---|---|---|
| Public Telemetry (/api/health) | Unauthenticated Ingress | HTTP 200 | Returns required KV state metadata without requiring access tokens. |
| Admin Actions (/api/admin/wipe) | Missing Cf-Access-Jwt-Assertion header | HTTP 401 | Rejects unauthenticated requests immediately at the perimeter layer. |
| Administrative Actions | Valid access headers with mismatched x-admin-token | HTTP 403 | Prevents unauthorized administrative execution via signature verification. |
| Administrative Actions | Valid Access assertions with matching tokens | Pass Security Gates | Executes intended sandbox flags under an authenticated state. |
| Cross-Origin Requests | OPTIONS preflight policy | HTTP 204 | Enforces exact origin matching against whitelisted domain endpoints (https://apexcapitalweb.com). |
| | | | |

## 3. Local Edge Emulation Environment
The localized Caddy proxy architecture (etc/caddy/Caddyfile.dev) simplifies local worker testing by matching production edge behavior:

* Traffic Routing: Maps static asset roots while reverse-proxying API traffic directly to the local Wrangler worker node (localhost:8787).
* Automated Header Injection: Injects mock Cloudflare Access headers (Cf-Access-Jwt-Assertion) and administration signatures (x-admin-token) on upstream local traffic.
* Developer Velocity: Eliminates the need for developers to hardcode security bypasses or toggle flags inside production worker code during local development.

## 4. Automated Post-Deployment Integration Workbook
The automated Python verification script (tools/post_deploy_workbook.py) executes immediate post-cutover health assertions:

* Edge Ingress Verification: Validates live domain connectivity and measures transport timing against a strict timeout window.
* CORS Compliance Audit: Scans response headers to verify exact alignment for Access-Control-Allow-Origin and Access-Control-Allow-Credentials.
* Payload Invariant Validation: Evaluates core structural boolean parameters (ok, production_trading, client_money) to guarantee that sandbox protection mechanisms remain properly configured post-deployment.

## Public Site Grounding & Guardrails
According to the live web plane metadata for the platform (apexcapitalweb.com), the core software is explicitly designated as a controlled sandbox. The production network asserts that production trading, client money, and custody are not enabled in this build, and privileged actions require dual-control governance.
The payload invariant checks in your Python script directly protect these high-stakes business boundaries by ensuring that if an environment cutover accidentally toggles a flag to expose non-functional trading or custody rails, the build breaches immediately and alerts infrastructure teams.
## 5. Continuous Delivery & Release Tracking
The GitHub Actions pipeline (.github/workflows/release.yml) automates versioning stability and internal knowledge base syncs:

* Zero-Trust Checkout: Utilizes actions/checkout@v4 with restricted local persistence rules (persist-credentials: false) to safeguard repository security.
* Semantic Tagging: Calculates precise semantic version increments automatically based on standard repository commit conventions.
* Documentation Synchronization: Appends real-time deployment timestamps and verification logs directly to the internal codespaces onboarding markdown files (docs/codespaces_onboarding.md).


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
