/**
 * Apex Capital — Contact API handler
 * Order of checks:
 *  1. Method + basic input validation
 *  2. Rate limit (IP + email)
 *  3. Turnstile Siteverify
 *  4. Persist inquiry to SANDBOX_KV (sandbox only — no client money)
 */

import { checkRateLimit, CONTACT_RATE_LIMIT } from "./rate-limit";

export interface Env {
  RATE_LIMIT_KV: KVNamespace;
  SANDBOX_KV?: KVNamespace;
  TURNSTILE_SECRET_KEY: string;
  ALLOWED_ORIGINS?: string;
}

const DEFAULT_ORIGINS =
  "https://apexcapitalweb.com,https://apex-capital-web.pages.dev,http://localhost:8080,http://localhost:8787,http://127.0.0.1:8787";

function parseAllowedOrigins(env: Env): string[] {
  return (env.ALLOWED_ORIGINS ?? DEFAULT_ORIGINS)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function corsHeaders(request: Request, env: Env): Record<string, string> {
  const origin = request.headers.get("Origin") ?? "";
  const allowed = parseAllowedOrigins(env);
  const headers: Record<string, string> = {
    Vary: "Origin",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
  };
  if (origin && allowed.includes(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
  }
  return headers;
}

function json(
  request: Request,
  env: Env,
  data: unknown,
  status = 200,
  extraHeaders: Record<string, string> = {}
): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...corsHeaders(request, env),
      ...extraHeaders,
    },
  });
}

async function verifyTurnstile(
  token: string,
  secret: string,
  ip: string
): Promise<boolean> {
  if (!secret) return false;
  const body = new URLSearchParams({
    secret,
    response: token,
    remoteip: ip,
  });

  const res = await fetch(
    "https://challenges.cloudflare.com/turnstile/v0/siteverify",
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    }
  );

  const result = (await res.json()) as { success?: boolean };
  return !!result.success;
}

export async function handleContact(
  request: Request,
  env: Env
): Promise<Response> {
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: corsHeaders(request, env),
    });
  }

  if (request.method !== "POST") {
    return json(request, env, { error: "Method not allowed" }, 405);
  }

  const ip =
    request.headers.get("CF-Connecting-IP") ||
    request.headers.get("X-Forwarded-For")?.split(",")[0]?.trim() ||
    "unknown";

  let name = "";
  let email = "";
  let organization = "";
  let message = "";
  let turnstileToken = "";

  const contentType = request.headers.get("Content-Type") || "";
  if (contentType.includes("application/json")) {
    const body = (await request.json()) as Record<string, string>;
    name = (body.name || "").trim();
    email = (body.email || "").trim();
    organization = (body.organization || "").trim();
    message = (body.message || "").trim();
    turnstileToken = body["cf-turnstile-response"] || body.turnstileToken || "";
  } else {
    const form = await request.formData();
    name = String(form.get("name") || "").trim();
    email = String(form.get("email") || "").trim();
    organization = String(form.get("organization") || "").trim();
    message = String(form.get("message") || "").trim();
    turnstileToken = String(form.get("cf-turnstile-response") || "").trim();
  }

  if (!name || !email || !message) {
    return json(request, env, { error: "Name, email and message are required" }, 400);
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return json(request, env, { error: "Invalid email" }, 400);
  }
  if (message.length > 5000) {
    return json(request, env, { error: "Message too long" }, 400);
  }

  // 1. Rate limit
  const rl = await checkRateLimit(
    { ...CONTACT_RATE_LIMIT, kv: env.RATE_LIMIT_KV },
    ip,
    email
  );

  if (!rl.allowed) {
    return json(
      request,
      env,
      {
        error: "Too many requests. Please try again later.",
        retryAfter: rl.retryAfter,
      },
      429,
      {
        "Retry-After": String(rl.retryAfter ?? 60),
        "X-RateLimit-Remaining": "0",
        "X-RateLimit-Reset": String(rl.resetAt),
      }
    );
  }

  // 2. Turnstile
  if (!turnstileToken) {
    return json(request, env, { error: "Turnstile token missing" }, 400);
  }

  const turnstileOk = await verifyTurnstile(
    turnstileToken,
    env.TURNSTILE_SECRET_KEY,
    ip
  );

  if (!turnstileOk) {
    return json(request, env, { error: "Turnstile verification failed" }, 403);
  }

  // 3. Persist (sandbox only — illustrative inquiries, not client money)
  const inquiryId = crypto.randomUUID();
  const record = {
    id: inquiryId,
    name,
    email,
    organization: organization || null,
    message,
    ip,
    source: "sandbox-mock",
    at: new Date().toISOString(),
  };

  if (env.SANDBOX_KV) {
    await env.SANDBOX_KV.put(`contact:${inquiryId}`, JSON.stringify(record), {
      expirationTtl: 60 * 60 * 24 * 30, // 30 days
    });
  }

  return json(
    request,
    env,
    {
      ok: true,
      id: inquiryId,
      remaining: rl.remaining,
      source: "sandbox-mock",
    },
    200,
    {
      "X-RateLimit-Remaining": String(rl.remaining),
      "X-RateLimit-Reset": String(rl.resetAt),
    }
  );
}
