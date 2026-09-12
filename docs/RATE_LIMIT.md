# Rate Limiting — Apex Capital Contact API

## Limits (default)
| Key | Limit | Window |
|-----|-------|--------|
| IP | 5 requests | 15 minutes |
| Email | 3 requests | 1 hour |

## Cloudflare setup

1. Create a KV namespace:
   ```bash
   npx wrangler kv:namespace create RATE_LIMIT_KV
   npx wrangler kv:namespace create RATE_LIMIT_KV --preview
   ```

2. Bind in `wrangler.toml`:
   ```toml
   [[kv_namespaces]]
   binding = "RATE_LIMIT_KV"
   id = "<your-kv-id>"
   preview_id = "<your-preview-kv-id>"
   ```

3. Secrets:
   ```bash
   npx wrangler secret put TURNSTILE_SECRET_KEY
   ```

## Handler usage

```ts
import { handleContact } from "./contact-handler";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/api/contact") {
      return handleContact(request, env);
    }
    return new Response("Not found", { status: 404 });
  },
};
```

## Response headers
- `Retry-After` — seconds until the client may retry (on 429)
- `X-RateLimit-Remaining` — remaining requests in current window
- `X-RateLimit-Reset` — unix timestamp when the window resets

## Tuning
Edit `CONTACT_RATE_LIMIT` in `rate-limit.ts` to change limits.
For stricter protection, lower `ipLimit` or shorten the window.
