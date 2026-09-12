/**
 * Apex Capital — Contact form rate limiter
 * Designed for Cloudflare Workers + KV.
 *
 * Strategy: fixed-window counters per IP (and optional per-email).
 * - 5 requests per 15 minutes per IP
 * - 3 requests per hour per email (when provided)
 * Returns 429 with Retry-After when exceeded.
 *
 * If kv is missing, allows the request (fail-open for misconfiguration during setup)
 * but does not increment — production must bind RATE_LIMIT_KV.
 */

export interface RateLimitConfig {
  ipLimit: number;
  ipWindowSeconds: number;
  emailLimit?: number;
  emailWindowSeconds?: number;
  kv: KVNamespace | undefined;
  prefix?: string;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
  retryAfter?: number;
}

function windowKey(prefix: string, kind: string, id: string, windowStart: number): string {
  return `${prefix}:${kind}:${id}:${windowStart}`;
}

export async function checkRateLimit(
  config: RateLimitConfig,
  ip: string,
  email?: string
): Promise<RateLimitResult> {
  const now = Math.floor(Date.now() / 1000);
  const prefix = config.prefix ?? "rl:contact";
  const ipWindowStart = now - (now % config.ipWindowSeconds);
  const resetAt = ipWindowStart + config.ipWindowSeconds;

  // Fail-open if KV not bound (setup phase) — still enforce in production with binding
  if (!config.kv) {
    return {
      allowed: true,
      remaining: config.ipLimit,
      resetAt,
    };
  }

  const kv = config.kv;
  const ipKey = windowKey(prefix, "ip", ip || "unknown", ipWindowStart);

  const ipRaw = await kv.get(ipKey);
  const ipCount = ipRaw ? parseInt(ipRaw, 10) : 0;

  if (ipCount >= config.ipLimit) {
    return {
      allowed: false,
      remaining: 0,
      resetAt,
      retryAfter: Math.max(1, resetAt - now),
    };
  }

  if (email && config.emailLimit && config.emailWindowSeconds) {
    const emailWindowStart = now - (now % config.emailWindowSeconds);
    const emailKey = windowKey(
      prefix,
      "email",
      email.toLowerCase().trim(),
      emailWindowStart
    );
    const emailRaw = await kv.get(emailKey);
    const emailCount = emailRaw ? parseInt(emailRaw, 10) : 0;

    if (emailCount >= config.emailLimit) {
      const emailReset = emailWindowStart + config.emailWindowSeconds;
      return {
        allowed: false,
        remaining: 0,
        resetAt: emailReset,
        retryAfter: Math.max(1, emailReset - now),
      };
    }

    await kv.put(emailKey, String(emailCount + 1), {
      expirationTtl: config.emailWindowSeconds + 60,
    });
  }

  const newCount = ipCount + 1;
  await kv.put(ipKey, String(newCount), {
    expirationTtl: config.ipWindowSeconds + 60,
  });

  return {
    allowed: true,
    remaining: Math.max(0, config.ipLimit - newCount),
    resetAt,
  };
}

export const CONTACT_RATE_LIMIT: Omit<RateLimitConfig, "kv"> = {
  ipLimit: 5,
  ipWindowSeconds: 15 * 60,
  emailLimit: 3,
  emailWindowSeconds: 60 * 60,
  prefix: "rl:contact",
};
