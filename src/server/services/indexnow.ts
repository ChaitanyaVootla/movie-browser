/**
 * IndexNow — push-notify search engines (Bing, Yandex, Seznam, Naver) about
 * new/updated URLs instead of waiting for a recrawl. Google does not consume
 * IndexNow; for Google the honest sitemap lastmod is the equivalent signal.
 *
 * The key is intentionally public: the protocol verifies ownership by fetching
 * `https://themoviebrowser.com/{key}.txt` (served from public/, exempted from
 * the scraper-blocking proxy matcher).
 *
 * Fire-and-forget by design: never throws, errors are logged and swallowed.
 * `scripts/generate-sitemap.js` ports this logic for its nightly batch ping —
 * keep host/key/endpoint in sync if they ever change.
 */

import { dataLogger } from "@/lib/logger";
import { SITE_URL } from "@/lib/constants";

export const INDEXNOW_KEY = "666170ce7734064c2d3dbe589dc9cdfb";

const ENDPOINT = "https://api.indexnow.org/indexnow";
const MAX_URLS_PER_PING = 10000;

const log = dataLogger.child({ service: "indexnow" });

function isEnabled(): boolean {
  // Never ping from dev/CI builds — only the prod box should announce URLs.
  return process.env.NODE_ENV === "production" && process.env.INDEXNOW_DISABLED !== "1";
}

/**
 * Notify IndexNow-participating engines that the given site paths changed.
 * Accepts paths ("/movie/27205/inception") or absolute SITE_URL URLs.
 */
export async function pingIndexNow(paths: string[]): Promise<void> {
  if (!isEnabled() || paths.length === 0) return;

  const urlList = paths
    .map((p) => (p.startsWith("http") ? p : `${SITE_URL}${p}`))
    .filter((u) => u.startsWith(SITE_URL))
    .slice(0, MAX_URLS_PER_PING);
  if (urlList.length === 0) return;

  try {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/json; charset=utf-8" },
      body: JSON.stringify({
        host: new URL(SITE_URL).host,
        key: INDEXNOW_KEY,
        keyLocation: `${SITE_URL}/${INDEXNOW_KEY}.txt`,
        urlList,
      }),
      signal: AbortSignal.timeout(10000),
    });
    if (res.ok) {
      log.debug({ count: urlList.length, status: res.status }, "IndexNow ping accepted");
    } else {
      log.warn({ count: urlList.length, status: res.status }, "IndexNow ping rejected");
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    log.warn({ count: urlList.length, error: message }, "IndexNow ping failed");
  }
}
