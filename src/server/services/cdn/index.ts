/**
 * Title-content freshness: when a background refresh writes MEANINGFULLY
 * changed ratings / deep links (or progressive enrichment stores AI), make
 * the next page load fresh instead of waiting out ISR (revalidate=3600) and
 * the Cloudflare copy (s-maxage=3600 + SWR 3600).
 *
 *   notifyTitleContentChanged(ref)
 *     ├─ NOW:  drop the origin ISR entry for the canonical path (in-process)
 *     └─ +~3s (debounced, rate-limited, batched — purge-queue.ts):
 *          ├─ drop the origin ISR entry AGAIN (a render that was already in
 *          │  flight when the upsert committed may have re-cached old data)
 *          └─ Cloudflare purge: page + .md twin (files) + `?_rsc=` variants (prefix)
 *
 * Origin first, edge second, always: purging the edge while the origin still
 * holds the old entry would just re-fill the edge with stale HTML.
 *
 * Fire-and-forget and silent-safe: nothing here can throw into hydration.
 * Volume: callers are capped by MAX_BACKGROUND_REFRESH (3 concurrent) and only
 * fire on real change, so steady state is a few titles/min — far below the
 * queue's 3 calls/min × 50 titles. See `.claude/rules/cdn.md` → "Title purge".
 */

import { SITE_URL } from "@/lib/constants";
import { trackAPICall } from "@/lib/analytics/track";
import { getCloudflarePurgeConfig, purgeCloudflare } from "./cloudflare";
import { invalidateOriginIsr } from "./origin-isr";
import { edgeTargets, originIsrKeys, type TitleRef } from "./paths";
import { PurgeQueue } from "./purge-queue";

export type { TitleRef } from "./paths";

function trackOrigin(paths: number, removed: number, started: number): void {
  try {
    trackAPICall({
      service: "cdn_purge",
      endpoint: "origin:isr",
      method: "DELETE",
      statusCode: 200,
      durationMs: Date.now() - started,
      quotaCost: paths,
      responseSize: removed,
    });
  } catch {
    /* never */
  }
}

async function sendBatch(batch: TitleRef[]): Promise<void> {
  const started = Date.now();
  const keys = batch.flatMap(originIsrKeys);
  const removed = await invalidateOriginIsr(keys);
  trackOrigin(keys.length, removed, started);

  const config = getCloudflarePurgeConfig();
  if (!config) return;
  const files: string[] = [];
  const prefixes: string[] = [];
  for (const ref of batch) {
    const t = edgeTargets(ref, SITE_URL);
    files.push(...t.files);
    prefixes.push(...t.prefixes);
  }
  await purgeCloudflare(config, { files, prefixes });
}

const QUEUE_KEY = Symbol.for("movie-browser.cdn-purge-queue");

function getQueue(): PurgeQueue {
  const g = globalThis as Record<symbol, unknown>;
  const existing = g[QUEUE_KEY];
  if (existing instanceof PurgeQueue) return existing;
  const q = new PurgeQueue({ send: sendBatch });
  g[QUEUE_KEY] = q;
  return q;
}

/**
 * Signal that a title's rendered content (ratings, deep links, AI) changed in
 * PG. Never throws, never awaits network on the caller's path.
 */
export function notifyTitleContentChanged(ref: TitleRef): void {
  try {
    if (!Number.isInteger(ref.id) || ref.id <= 0) return;
    const started = Date.now();
    const keys = originIsrKeys(ref);
    void invalidateOriginIsr(keys)
      .then((removed) => trackOrigin(keys.length, removed, started))
      .catch(() => {});
    getQueue().enqueue(ref);
  } catch {
    /* cache hint only — swallow */
  }
}

/**
 * Hydration helper: notify only when an upsert reports a committed, displayed
 * change (`UpsertOutcome.contentChanged` — never TMDB vote jitter alone).
 * Structural type so this module does not depend on the hydration layer.
 */
export function notifyIfContentChanged(
  outcome: { contentChanged?: boolean } | undefined | void,
  mediaType: TitleRef["mediaType"],
  id: number,
  title: string | null | undefined,
): void {
  if (outcome && outcome.contentChanged) notifyTitleContentChanged({ mediaType, id, title });
}

/** For admin/diagnostics. */
export function getPurgeQueueStats() {
  return getQueue().getStats();
}
