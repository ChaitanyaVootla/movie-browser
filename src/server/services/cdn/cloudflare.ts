/**
 * Cloudflare cache-purge client (Free plan — purge is free on every plan).
 *
 * Config (all optional — unset = edge purge is a silent no-op, origin ISR
 * invalidation still runs):
 *   CLOUDFLARE_ZONE_ID      zone id (already in the box env for analytics)
 *   CLOUDFLARE_PURGE_TOKEN  API token with ONLY `Zone → Cache Purge → Purge`
 *                           on the themoviebrowser.com zone. Falls back to
 *                           CLOUDFLARE_API_TOKEN, which (Oct 2026) LACKS the
 *                           permission and answers code 10000.
 *   CDN_EDGE_PURGE          "off" disables edge purge entirely (kill switch).
 *
 * One API call per target kind — the purge endpoint takes exactly one of
 * files / prefixes / tags / hosts per request. Never "purge everything" and
 * never a bare-host prefix: cdn.md (a `/*` cold-purge caused the Jun 11 outage).
 */

import { trackAPICall } from "@/lib/analytics/track";
import type { EdgeTargets } from "./paths";

/** Cloudflare's per-request cap for every purge kind. */
export const MAX_ITEMS_PER_PURGE_CALL = 100;
const TIMEOUT_MS = 10_000;

export interface CloudflarePurgeConfig {
  zoneId: string;
  token: string;
}

export function getCloudflarePurgeConfig(
  env: Record<string, string | undefined> = process.env,
): CloudflarePurgeConfig | null {
  if (env.CDN_EDGE_PURGE === "off") return null;
  const zoneId = env.CLOUDFLARE_ZONE_ID?.trim();
  const token = (env.CLOUDFLARE_PURGE_TOKEN || env.CLOUDFLARE_API_TOKEN)?.trim();
  if (!zoneId || !token) return null;
  return { zoneId, token };
}

export interface PurgeCallResult {
  ok: boolean;
  status: number;
  /** Cloudflare error code (e.g. 10000 = token lacks Cache Purge, 971/1134 = rate limited). */
  errorCode: number | null;
  errorMessage: string | null;
}

type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

interface CloudflareErrorBody {
  success?: boolean;
  errors?: Array<{ code?: number; message?: string }>;
}

function isErrorBody(v: unknown): v is CloudflareErrorBody {
  return typeof v === "object" && v !== null;
}

/** Guard: a prefix must name a title path, never the host root. */
export function isSafePrefix(prefix: string): boolean {
  const slash = prefix.indexOf("/");
  if (slash <= 0) return false;
  const path = prefix.slice(slash);
  return /^\/(movie|series)\/\d+\/[a-z0-9-]+$/.test(path);
}

async function purgeOnce(
  config: CloudflarePurgeConfig,
  kind: "files" | "prefixes",
  items: string[],
  fetchImpl: FetchLike,
): Promise<PurgeCallResult> {
  const started = Date.now();
  let result: PurgeCallResult;
  try {
    const res = await fetchImpl(
      `https://api.cloudflare.com/client/v4/zones/${config.zoneId}/purge_cache`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ [kind]: items }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      },
    );
    const body: unknown = await res.json().catch(() => null);
    const err = isErrorBody(body) ? body.errors?.[0] : undefined;
    const ok = res.ok && isErrorBody(body) && body.success === true;
    result = {
      ok,
      status: res.status,
      errorCode: ok ? null : (err?.code ?? null),
      errorMessage: ok ? null : (err?.message ?? `HTTP ${res.status}`),
    };
  } catch (error: unknown) {
    result = {
      ok: false,
      status: 0,
      errorCode: null,
      errorMessage: error instanceof Error ? error.message : String(error),
    };
  }
  try {
    trackAPICall({
      service: "cdn_purge",
      endpoint: `cloudflare:${kind}`,
      method: "POST",
      statusCode: result.status,
      durationMs: Date.now() - started,
      quotaCost: items.length,
      errorType: result.ok ? null : result.errorCode ? `cf_${result.errorCode}` : "network",
      errorMessage: result.errorMessage,
    });
  } catch {
    /* tracking must never break purging */
  }
  return result;
}

export interface EdgePurgeResult {
  files: PurgeCallResult | null;
  prefixes: PurgeCallResult | null;
}

/**
 * Purge one batch (≤100 files + ≤100 prefixes). Never throws. Callers are
 * responsible for rate limiting (see purge-queue.ts).
 */
export async function purgeCloudflare(
  config: CloudflarePurgeConfig,
  targets: EdgeTargets,
  fetchImpl: FetchLike = fetch,
): Promise<EdgePurgeResult> {
  const files = targets.files.slice(0, MAX_ITEMS_PER_PURGE_CALL);
  const prefixes = targets.prefixes.filter(isSafePrefix).slice(0, MAX_ITEMS_PER_PURGE_CALL);
  return {
    files: files.length ? await purgeOnce(config, "files", files, fetchImpl) : null,
    prefixes: prefixes.length ? await purgeOnce(config, "prefixes", prefixes, fetchImpl) : null,
  };
}
