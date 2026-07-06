/**
 * Rate limiter — in-memory sliding window.
 *
 * Why in-memory and not Redis: this is a single-process Next.js app.
 * For multi-instance deployments, swap this for `@upstash/ratelimit` or
 * a Redis-backed counter.
 *
 * Usage:
 *   const rl = rateLimiter({ windowMs: 15*60*1000, max: 5 });
 *   const result = rl.check(ip);
 *   if (!result.ok) return 429;
 */

export interface RateLimiterOptions {
  windowMs: number;   // window size in milliseconds
  max: number;        // max requests per window per key
  keyPrefix?: string; // namespace (e.g. "login", "pty")
}

export interface RateLimitResult {
  ok: boolean;
  remaining: number;
  retryAfterMs: number;
  total: number;
}

interface Bucket {
  timestamps: number[];
}

const buckets = new Map<string, Bucket>();

// Periodic cleanup of expired buckets (every 5 min)
setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of buckets) {
    bucket.timestamps = bucket.timestamps.filter(t => now - t < 60 * 60 * 1000);
    if (bucket.timestamps.length === 0) {
      buckets.delete(key);
    }
  }
}, 5 * 60 * 1000).unref();

export function rateLimiter(opts: RateLimiterOptions) {
  const { windowMs, max, keyPrefix = "default" } = opts;

  return {
    check(key: string): RateLimitResult {
      const fullKey = `${keyPrefix}:${key}`;
      const now = Date.now();
      const cutoff = now - windowMs;

      let bucket = buckets.get(fullKey);
      if (!bucket) {
        bucket = { timestamps: [] };
        buckets.set(fullKey, bucket);
      }

      // Drop expired timestamps
      bucket.timestamps = bucket.timestamps.filter(t => t > cutoff);

      if (bucket.timestamps.length >= max) {
        // Compute retryAfter based on oldest timestamp in window
        const oldest = bucket.timestamps[0];
        const retryAfterMs = oldest + windowMs - now;
        return {
          ok: false,
          remaining: 0,
          retryAfterMs: Math.max(1000, retryAfterMs),
          total: bucket.timestamps.length,
        };
      }

      bucket.timestamps.push(now);
      return {
        ok: true,
        remaining: max - bucket.timestamps.length,
        retryAfterMs: 0,
        total: bucket.timestamps.length,
      };
    },

    /** Reset the bucket for a given key (e.g. after successful login) */
    reset(key: string) {
      buckets.delete(`${keyPrefix}:${key}`);
    },
  };
}

/** Get client IP from request — handles Caddy/Nginx proxies. */
export function getClientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  const xri = req.headers.get("x-real-ip");
  if (xri) return xri;
  return "unknown";
}

/** Standard 429 response with proper headers. */
export function rateLimitedResponse(retryAfterMs: number, message?: string) {
  const retryAfterSec = Math.ceil(retryAfterMs / 1000);
  return new Response(
    JSON.stringify({
      error: message ?? "Too many requests. Try again later.",
      retryAfter: retryAfterSec,
    }),
    {
      status: 429,
      headers: {
        "Content-Type": "application/json",
        "Retry-After": String(retryAfterSec),
        "X-RateLimit-Remaining": "0",
      },
    }
  );
}
