/**
 * Apex Capital — Controlled Sandbox Worker API
 * Hardened to degrade gracefully when Cloudflare bindings/secrets are missing.
 */

import { handleContact as handleContactSecure } from "./contact-handler";

export interface Env {
  SANDBOX_KV?: KVNamespace;
  RATE_LIMIT_KV?: KVNamespace;
  ADMIN_TOKEN?: string;
  TURNSTILE_SECRET_KEY?: string;
  ALLOW_DEMO_TURNSTILE?: string;
  ALLOWED_ORIGINS?: string;
}

const SANDBOX = {
  environment: "controlled-sandbox",
  production_trading: false,
  client_money: false,
  custody: false,
  source: "sandbox-mock",
} as const;

/** Official Cloudflare always-pass test secret (demo only) */
const DEMO_TURNSTILE_SECRET = "1x0000000000000000000000000000000AA";

const MAX_TOKEN_COMPARE_BYTES = 256;

export function timingSafeEqualString(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const ba = enc.encode(String(a ?? ""));
  const bb = enc.encode(String(b ?? ""));
  const lenA = Math.min(ba.byteLength, MAX_TOKEN_COMPARE_BYTES);
  const lenB = Math.min(bb.byteLength, MAX_TOKEN_COMPARE_BYTES);
  const maxLen = MAX_TOKEN_COMPARE_BYTES;
  const pa = new Uint8Array(maxLen);
  const pb = new Uint8Array(maxLen);
  pa.set(ba.subarray(0, lenA));
  pb.set(bb.subarray(0, lenB));
  let diff = 0;
  for (let i = 0; i < maxLen; i++) diff |= pa[i] ^ pb[i];
  diff |= lenA ^ lenB;
  return diff === 0;
}

function parseAllowedOrigins(env: Env): string[] {
  const raw =
    env.ALLOWED_ORIGINS ??
    "https://apexcapitalweb.com,https://www.apexcapitalweb.com,https://apex-capital-web.pages.dev,http://localhost:8080,http://localhost:8787,http://127.0.0.1:8787";
  return raw.split(",").map((s) => s.trim()).filter(Boolean);
}

function corsHeaders(request: Request, env: Env): Record<string, string> {
  const origin = request.headers.get("Origin") ?? "";
  const allowed = parseAllowedOrigins(env);
  const headers: Record<string, string> = {
    Vary: "Origin",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, x-admin-token",
    "Access-Control-Max-Age": "86400",
  };
  if (origin && allowed.includes(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
    headers["Access-Control-Allow-Credentials"] = "true";
  }
  return headers;
}

function json(
  request: Request,
  env: Env,
  data: unknown,
  status = 200
): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-apex-environment": SANDBOX.environment,
      ...corsHeaders(request, env),
    },
  });
}

function resolveTurnstileSecret(env: Env): {
  secret: string;
  mode: "production" | "demo" | "missing";
} {
  if (env.TURNSTILE_SECRET_KEY && env.TURNSTILE_SECRET_KEY.trim()) {
    return { secret: env.TURNSTILE_SECRET_KEY.trim(), mode: "production" };
  }
  // Allow demo secret so the API works before secrets are configured
  if (env.ALLOW_DEMO_TURNSTILE !== "false") {
    return { secret: DEMO_TURNSTILE_SECRET, mode: "demo" };
  }
  return { secret: "", mode: "missing" };
}

async function probeKv(
  kv: KVNamespace | undefined,
  label: string
): Promise<{ name: string; status: string }> {
  if (!kv) return { name: label, status: "UNBOUND" };
  try {
    const key = `health:${label}`;
    await kv.put(key, String(Date.now()), { expirationTtl: 60 });
    const v = await kv.get(key);
    return { name: label, status: v ? "CONNECTED" : "ERROR" };
  } catch (e) {
    return { name: label, status: "ERROR" };
  }
}

async function handleHealth(request: Request, env: Env): Promise<Response> {
  const [sandboxKv, rateKv] = await Promise.all([
    probeKv(env.SANDBOX_KV, "SANDBOX_KV"),
    probeKv(env.RATE_LIMIT_KV, "RATE_LIMIT_KV"),
  ]);
  const turnstile = resolveTurnstileSecret(env);

  const issues: string[] = [];
  if (sandboxKv.status === "UNBOUND") issues.push("SANDBOX_KV not bound — set id in wrangler.toml");
  if (rateKv.status === "UNBOUND") issues.push("RATE_LIMIT_KV not bound — set id in wrangler.toml");
  if (sandboxKv.status === "ERROR") issues.push("SANDBOX_KV error — check namespace id");
  if (rateKv.status === "ERROR") issues.push("RATE_LIMIT_KV error — check namespace id");
  if (turnstile.mode === "demo") issues.push("TURNSTILE_SECRET_KEY unset — using demo secret (not for production)");
  if (turnstile.mode === "missing") issues.push("TURNSTILE_SECRET_KEY missing and demo disabled");
  if (!env.ADMIN_TOKEN) issues.push("ADMIN_TOKEN unset — admin wipe disabled");

  return json(request, env, {
    ok: true,
    ...SANDBOX,
    bindings: {
      SANDBOX_KV: sandboxKv.status,
      RATE_LIMIT_KV: rateKv.status,
      TURNSTILE: turnstile.mode,
      ADMIN_TOKEN: env.ADMIN_TOKEN ? "SET" : "UNSET",
    },
    issues,
    time: new Date().toISOString(),
  });
}

async function handleAdminWipe(request: Request, env: Env): Promise<Response> {
  const provided = request.headers.get("x-admin-token") ?? "";
  const expected = env.ADMIN_TOKEN ?? "";

  if (!expected || !timingSafeEqualString(provided, expected)) {
    return json(request, env, { error: "Forbidden", source: SANDBOX.source }, 403);
  }

  if (env.SANDBOX_KV) {
    try {
      await env.SANDBOX_KV.put(
        "admin:last_wipe",
        JSON.stringify({
          at: new Date().toISOString(),
          source: SANDBOX.source,
          note: "sandbox flag only — no client money",
        })
      );
    } catch {
      /* ignore */
    }
  }

  return json(request, env, {
    ok: true,
    action: "sandbox_wipe_flag_set",
    source: SANDBOX.source,
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      const url = new URL(request.url);
      const path = url.pathname.replace(/\/+$/, "") || "/";

      if (request.method === "OPTIONS") {
        return new Response(null, {
          status: 204,
          headers: corsHeaders(request, env),
        });
      }

      if (request.method === "GET" && path === "/api/health") {
        return handleHealth(request, env);
      }

      if (request.method === "POST" && path === "/api/contact") {
        const { secret, mode } = resolveTurnstileSecret(env);
        const contactEnv = {
          ...env,
          TURNSTILE_SECRET_KEY: secret,
          _turnstileMode: mode,
        };
        return handleContactSecure(request, contactEnv as any);
      }

      if (request.method === "POST" && path === "/api/admin/wipe") {
        return handleAdminWipe(request, env);
      }

      if (path.startsWith("/api/")) {
        return json(request, env, { error: "Not Found", source: SANDBOX.source }, 404);
      }

      return json(request, env, {
        service: "apex-sandbox-api",
        ...SANDBOX,
        routes: [
          "GET /api/health",
          "POST /api/contact",
          "POST /api/admin/wipe",
          "OPTIONS *",
        ],
        hint: "GET /api/health for binding diagnostics",
      });
    } catch (err) {
      return new Response(
        JSON.stringify({
          error: "Internal error",
          source: "sandbox-mock",
          message: err instanceof Error ? err.message : "unknown",
        }),
        {
          status: 500,
          headers: {
            "content-type": "application/json",
            ...corsHeaders(request, env),
          },
        }
      );
    }
  },
};
