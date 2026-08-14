/**
 * Chat Rate Limiting (in-memory, per-process)
 *
 * The AI chat endpoint costs real money per invocation (Bedrock tokens,
 * potentially Tavily credits). The anon message limit used to live ONLY in the
 * browser (use-chat-stream.ts), so a direct POST got unlimited free agent
 * invocations. This enforces bounds server-side.
 *
 * In-memory is fine: the app runs as a single PM2 process; limits reset on
 * deploy, which is acceptable for abuse protection (not billing).
 */

import { extractIP } from "@/lib/geoip";

interface WindowState {
  /** Timestamps (ms) of accepted requests, pruned lazily */
  hits: number[];
}

interface LimitRule {
  windowMs: number;
  max: number;
}

// Generous for humans, hard wall for scripts
const ANON_RULES: LimitRule[] = [
  { windowMs: 10 * 60 * 1000, max: 15 }, // burst: 15 / 10 min
  { windowMs: 24 * 60 * 60 * 1000, max: 60 }, // sustained: 60 / day
];

const AUTH_RULES: LimitRule[] = [
  { windowMs: 10 * 60 * 1000, max: 40 },
  { windowMs: 24 * 60 * 60 * 1000, max: 300 },
];

const buckets = new Map<string, WindowState>();

// Prevent unbounded Map growth under IP churn
const MAX_BUCKETS = 50_000;
const MAX_WINDOW_MS = 24 * 60 * 60 * 1000;
let lastSweep = 0;

function sweep(now: number) {
  if (now - lastSweep < 60 * 60 * 1000 && buckets.size < MAX_BUCKETS) return;
  lastSweep = now;
  for (const [key, state] of buckets) {
    const newest = state.hits[state.hits.length - 1] ?? 0;
    if (now - newest > MAX_WINDOW_MS) buckets.delete(key);
  }
}

export interface RateLimitResult {
  allowed: boolean;
  /** Seconds until the earliest blocked window frees up (rough) */
  retryAfterSeconds?: number;
}

/**
 * Check + record one chat request.
 * Key by userId when authenticated, client IP otherwise.
 */
export function checkChatRateLimit(opts: {
  userId: string | null;
  ip: string;
}): RateLimitResult {
  const now = Date.now();
  sweep(now);

  const isAuthed = !!opts.userId;
  const key = isAuthed ? `u:${opts.userId}` : `ip:${opts.ip}`;
  const rules = isAuthed ? AUTH_RULES : ANON_RULES;

  let state = buckets.get(key);
  if (!state) {
    state = { hits: [] };
    buckets.set(key, state);
  }

  // Prune anything older than the largest window
  state.hits = state.hits.filter((t) => now - t < MAX_WINDOW_MS);

  for (const rule of rules) {
    const inWindow = state.hits.filter((t) => now - t < rule.windowMs);
    if (inWindow.length >= rule.max) {
      const oldest = inWindow[0];
      return {
        allowed: false,
        retryAfterSeconds: Math.max(1, Math.ceil((oldest + rule.windowMs - now) / 1000)),
      };
    }
  }

  state.hits.push(now);
  return { allowed: true };
}

/**
 * Client IP for the rate-limit bucket key.
 *
 * Delegates to `extractIP` (`@/lib/geoip`) — the one place allowed to know how
 * each CDN reports the viewer. That matters here: this used to read
 * `X-Forwarded-For` first and trust its leading entry, which is only the client
 * if every hop in front is well-behaved. `extractIP` prefers the CDN's
 * authoritative viewer header (`CloudFront-Viewer-Address`, or Cloudflare's
 * `CF-Connecting-IP`) and falls back to exactly the old XFF / X-Real-IP logic,
 * so it is strictly more correct on both CDNs — and it stops the rate limiter
 * from ever collapsing all anonymous users into a single per-edge-node bucket.
 */
export function getClientIp(headers: Headers): string {
  return extractIP(headers);
}
