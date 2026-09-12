/**
 * Apex Capital — Contact API handler
 * Order of checks:
 *  1. Method + basic input validation
 *  2. Rate limit (IP + email)
 *  3. Turnstile Siteverify
 *  4. Persist / forward inquiry
 */

import { checkRateLimit, CONTACT_RATE_LIMIT } from "./rate-limit";

export interface Env {
  RATE_LIMIT_KV: KVNamespace;
  TURNSTILE_SECRET_KEY: string;
}

function json(data: unknown, status = 200, extraHeaders: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "https://apexcapitalweb.com",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      ...extraHeaders,
    },
  });
}

async function verifyTurnstile(token: string, secret: string, ip: string): Promise<boolean> {
  if (!secret) return false;
  const body = new URLSearchParams({
    secret,
    response: token,
    remoteip: ip,
  });

  const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  const result = (await res.json()) as { success?: boolean };
  return !!result.success;
}

export async function handleContact(request: Request, env: Env): Promise<Response> {
  if (request.method === "OPTIONS") {
    return json({}, 204);
  }

  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
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
    return json({ error: "Name, email and message are required" }, 400);
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return json({ error: "Invalid email" }, 400);
  }
  if (message.length > 5000) {
    return json({ error: "Message too long" }, 400);
  }

  const rl = await checkRateLimit(
    { ...CONTACT_RATE_LIMIT, kv: env.RATE_LIMIT_KV },
    ip,
    email
  );

  if (!rl.allowed) {
    return json(
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

  if (!turnstileToken) {
    return json({ error: "Turnstile token missing" }, 400);
  }

  const turnstileOk = await verifyTurnstile(
    turnstileToken,
    env.TURNSTILE_SECRET_KEY,
    ip
  );

  if (!turnstileOk) {
    return json({ error: "Turnstile verification failed" }, 403);
  }

  const inquiryId = crypto.randomUUID();

  return json(
    {
      ok: true,
      id: inquiryId,
      remaining: rl.remaining,
    },
    200,
    {
      "X-RateLimit-Remaining": String(rl.remaining),
      "X-RateLimit-Reset": String(rl.resetAt),
    }
  );
}
