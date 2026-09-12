/**
 * Apex Capital — Contact form rate limiter
 * Designed for Cloudflare Workers + KV.
 *
 * Strategy: fixed-window counters per IP (and optional per-email).
 * - 5 requests per 15 minutes per IP
 * - 3 requests per hour per email (when provided)
 * Returns 429 with Retry-After when exceeded.
 */

export interface RateLimitConfig {
  ipLimit: number;          // max requests per window per IP
  ipWindowSeconds: number;  // window length
  emailLimit?: number;      // optional secondary limit
  emailWindowSeconds?: number;
  kv: KVNamespace;          // Cloudflare KV binding
  prefix?: string;          // key prefix
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;          // unix seconds
  retryAfter?: number;      // seconds until window resets
}

function windowKey(prefix: string, kind: string, id: string, windowStart: number): string {
  return `${prefix}:${kind}:${id}:${windowStart}`;
}

/**
 * Fixed-window rate limit check + increment.
 * Uses a single KV read + write (eventual consistency is acceptable for this use case).
 */
export async function checkRateLimit(
  config: RateLimitConfig,
  ip: string,
  email?: string
): Promise<RateLimitResult> {
  const prefix = config.prefix ?? "rl:contact";
  const now = Math.floor(Date.now() / 1000);
  const ipWindowStart = now - (now % config.ipWindowSeconds);
  const ipKey = windowKey(prefix, "ip", ip || "unknown", ipWindowStart);

  // IP limit
  const ipRaw = await config.kv.get(ipKey);
  const ipCount = ipRaw ? parseInt(ipRaw, 10) : 0;

  if (ipCount >= config.ipLimit) {
    const resetAt = ipWindowStart + config.ipWindowSeconds;
    return {
      allowed: false,
      remaining: 0,
      resetAt,
      retryAfter: Math.max(1, resetAt - now),
    };
  }

  // Optional email limit
  if (email && config.emailLimit && config.emailWindowSeconds) {
    const emailWindowStart = now - (now % config.emailWindowSeconds);
    const emailKey = windowKey(prefix, "email", email.toLowerCase().trim(), emailWindowStart);
    const emailRaw = await config.kv.get(emailKey);
    const emailCount = emailRaw ? parseInt(emailRaw, 10) : 0;

    if (emailCount >= config.emailLimit) {
      const resetAt = emailWindowStart + config.emailWindowSeconds;
      return {
        allowed: false,
        remaining: 0,
        resetAt,
        retryAfter: Math.max(1, resetAt - now),
      };
    }

    // increment email counter
    await config.kv.put(emailKey, String(emailCount + 1), {
      expirationTtl: config.emailWindowSeconds + 60,
    });
  }

  // increment IP counter
  const newCount = ipCount + 1;
  await config.kv.put(ipKey, String(newCount), {
    expirationTtl: config.ipWindowSeconds + 60,
  });

  return {
    allowed: true,
    remaining: Math.max(0, config.ipLimit - newCount),
    resetAt: ipWindowStart + config.ipWindowSeconds,
  };
}

/** Convenience defaults for Apex contact form */
export const CONTACT_RATE_LIMIT: Omit<RateLimitConfig, "kv"> = {
  ipLimit: 5,
  ipWindowSeconds: 15 * 60,      // 5 per 15 min
  emailLimit: 3,
  emailWindowSeconds: 60 * 60,   // 3 per hour
  prefix: "rl:contact",
};
