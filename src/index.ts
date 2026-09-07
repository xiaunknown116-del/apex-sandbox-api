/**
 * Apex Capital — Controlled Sandbox Worker API
 *
 * Regulatory position (locked):
 * - production trading: disabled
 * - client money: not accepted
 * - custody: not enabled
 * - source label: sandbox-mock
 */

export interface Env {
  SANDBOX_KV: KVNamespace;
  ADMIN_TOKEN: string;
  ALLOWED_ORIGINS?: string;
}

const SANDBOX = {
  environment: "controlled-sandbox",
  production_trading: false,
  client_money: false,
  custody: false,
  source: "sandbox-mock",
} as const;

const MAX_TOKEN_COMPARE_BYTES = 256;

/**
 * Timing-safe string equality.
 * - Pads both sides to fixed maxLen with zeros (no early length return that leaks size).
 * - XOR-accumulates all bytes; equal only if result is 0 and original lengths match.
 */
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
  for (let i = 0; i < maxLen; i++) {
    diff |= pa[i] ^ pb[i];
  }
  // Fold length inequality without short-circuiting the byte loop above
  diff |= lenA ^ lenB;
  return diff === 0;
}

function parseAllowedOrigins(env: Env): string[] {
  const raw = env.ALLOWED_ORIGINS ?? "https://apexcapitalweb.com";
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
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

function isValidEmail(email: unknown): email is string {
  if (typeof email !== "string") return false;
  const e = email.trim();
  return e.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
}

async function handleHealth(request: Request, env: Env): Promise<Response> {
  let kv_storage: "CONNECTED" | "DISCONNECTED" | "ERROR" = "DISCONNECTED";
  try {
    if (env.SANDBOX_KV) {
      const key = "health:ping";
      await env.SANDBOX_KV.put(key, String(Date.now()), { expirationTtl: 60 });
      const v = await env.SANDBOX_KV.get(key);
      kv_storage = v ? "CONNECTED" : "ERROR";
    }
  } catch {
    kv_storage = "ERROR";
  }

  return json(request, env, {
    ok: true,
    ...SANDBOX,
    kv_storage,
    time: new Date().toISOString(),
  });
}

async function handleContact(request: Request, env: Env): Promise<Response> {
  let body: { email?: unknown; message?: unknown };
  try {
    body = await request.json();
  } catch {
    return json(request, env, { error: "Bad Request" }, 400);
  }

  if (!isValidEmail(body.email)) {
    return json(request, env, { error: "Bad Request" }, 400);
  }
  const message = body.message;
  if (
    typeof message !== "string" ||
    message.trim().length < 1 ||
    message.length > 5000
  ) {
    return json(request, env, { error: "Bad Request" }, 400);
  }

  if (env.SANDBOX_KV) {
    const id = `contact:${Date.now()}`;
    await env.SANDBOX_KV.put(
      id,
      JSON.stringify({
        email: body.email.trim(),
        message: message.trim(),
        source: SANDBOX.source,
        at: new Date().toISOString(),
      }),
      { expirationTtl: 60 * 60 * 24 * 30 }
    );
  }

  return json(request, env, { ok: true, source: SANDBOX.source });
}

async function handleAdminWipe(request: Request, env: Env): Promise<Response> {
  const provided = request.headers.get("x-admin-token") ?? "";
  const expected = env.ADMIN_TOKEN ?? "";

  if (!expected || !timingSafeEqualString(provided, expected)) {
    return json(
      request,
      env,
      { error: "Forbidden", source: SANDBOX.source },
      403
    );
  }

  if (env.SANDBOX_KV) {
    await env.SANDBOX_KV.put(
      "admin:last_wipe",
      JSON.stringify({
        at: new Date().toISOString(),
        source: SANDBOX.source,
        note: "sandbox flag only — no client money",
      })
    );
  }

  return json(request, env, {
    ok: true,
    action: "sandbox_wipe_flag_set",
    source: SANDBOX.source,
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
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
      return handleContact(request, env);
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
    });
  },
};
