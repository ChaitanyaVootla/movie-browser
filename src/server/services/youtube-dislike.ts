/**
 * Return YouTube Dislike (RYD) lookups.
 *
 * RYD is a free, community-run API (documented limits: 100 req/min, 10k/day) that
 * we call once per video when a viewer selects it. Its failure modes are mostly
 * EXPECTED and must not read as errors in `next-error.log`:
 *
 * | Response                     | Kind          | What we do                                        |
 * |------------------------------|---------------|---------------------------------------------------|
 * | 200 + body                   | ok            | cache 3 days                                      |
 * | 404 / 400 (unknown/bad id)   | `unavailable` | cache the miss for 6h, debug log                  |
 * | 429 / 5xx / timeout / network| `backoff`     | skip ALL RYD calls for 10 min, ONE warn per window |
 * | anything else                | `error`       | warn (genuinely unexpected), not cached           |
 *
 * Mirrors `classifyYouTubeError` + the quota backoff in `youtube.ts`. A transient
 * failure is reported to callers as `failed` (not `unavailable`) so they can avoid
 * persisting "0 dislikes" for a video whose count we simply could not fetch.
 */

import { cacheGet, cacheSet } from "@/lib/cache";
import { dataLogger } from "@/lib/logger";
import type { YouTubeDislikeData } from "@/types";

const RETURN_YOUTUBE_DISLIKE_API = "https://returnyoutubedislikeapi.com";

/** Successful lookups: dislike counts change slowly and the API is rate limited. */
const DISLIKE_CACHE_TTL_S = 3 * 24 * 60 * 60;
/** Unknown/invalid video ids: brief, so a video RYD learns about later is picked up. */
const DISLIKE_MISS_TTL_S = 6 * 60 * 60;
/** All RYD calls are skipped for this long after a 429 / 5xx / timeout / network error. */
export const DISLIKE_BACKOFF_MS = 10 * 60 * 1000;
/** Never let a slow third-party API hold a request (or an ISR render) open. */
const DISLIKE_FETCH_TIMEOUT_MS = 5000;

/** YouTube video ids are 11 chars of [A-Za-z0-9_-]; anything else is a guaranteed 400. */
const VIDEO_ID_RE = /^[A-Za-z0-9_-]{11}$/;

export type DislikeErrorKind = "unavailable" | "backoff" | "error";

export function classifyDislikeStatus(status: number): DislikeErrorKind {
  if (status === 404 || status === 400) return "unavailable";
  if (status === 429 || status >= 500) return "backoff";
  return "error";
}

export type DislikeLookup =
  | { status: "ok"; data: YouTubeDislikeData }
  /** Permanent for this video (RYD does not know it). Safe to store as 0. */
  | { status: "unavailable" }
  /** Transient (backoff, timeout, 5xx). Do NOT persist a 0 — retry later. */
  | { status: "failed" };

/**
 * The dislike count to persist, or `undefined` (= leave the column untouched in a
 * Prisma update) when RYD failed transiently. An unknown video is a real answer: 0.
 */
export function dislikeCountToStore(lookup: DislikeLookup): number | undefined {
  if (lookup.status === "ok") return lookup.data.dislikes;
  if (lookup.status === "unavailable") return 0;
  return undefined;
}

let backoffUntil = 0;
const inFlight = new Map<string, Promise<DislikeLookup>>();

function isDislikeBackoff(): boolean {
  return Date.now() < backoffUntil;
}

/** Starts (or extends) the backoff; warns only when a new window opens. */
function noteDislikeBackoff(cause: string): void {
  const opening = !isDislikeBackoff();
  backoffUntil = Date.now() + DISLIKE_BACKOFF_MS;
  if (opening) {
    dataLogger.warn({
      event: "youtube_dislike_backoff",
      cause,
      backoffMinutes: DISLIKE_BACKOFF_MS / 60000,
    });
  }
}

/** Test-only: reset module state between tests. */
export function __resetDislikeStateForTests(): void {
  backoffUntil = 0;
  inFlight.clear();
}

function isDislikeData(value: unknown): value is YouTubeDislikeData {
  return (
    typeof value === "object" &&
    value !== null &&
    "dislikes" in value &&
    typeof (value as { dislikes: unknown }).dislikes === "number"
  );
}

function describeFetchError(error: unknown): string {
  if (error instanceof Error) {
    if (error.name === "TimeoutError" || error.name === "AbortError") return "timeout";
    return error.message;
  }
  return String(error);
}

async function fetchDislike(videoId: string): Promise<DislikeLookup> {
  let response: Response;
  try {
    response = await fetch(`${RETURN_YOUTUBE_DISLIKE_API}/votes?videoId=${videoId}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(DISLIKE_FETCH_TIMEOUT_MS),
    });
  } catch (error: unknown) {
    // Timeout / DNS / connection reset: the API is slow or down, not this video.
    noteDislikeBackoff(describeFetchError(error));
    return { status: "failed" };
  }

  if (!response.ok) {
    const kind = classifyDislikeStatus(response.status);
    if (kind === "unavailable") {
      cacheSet("youtube", `dislike-miss:${videoId}`, true, DISLIKE_MISS_TTL_S);
      dataLogger.debug({ event: "youtube_dislike_unavailable", videoId, status: response.status });
      return { status: "unavailable" };
    }
    if (kind === "backoff") {
      noteDislikeBackoff(`http_${response.status}`);
      return { status: "failed" };
    }
    dataLogger.warn({ event: "youtube_dislike_error", videoId, status: response.status });
    return { status: "failed" };
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch (error: unknown) {
    noteDislikeBackoff(`bad_body: ${describeFetchError(error)}`);
    return { status: "failed" };
  }
  if (!isDislikeData(body)) {
    dataLogger.warn({ event: "youtube_dislike_unexpected_body", videoId });
    return { status: "failed" };
  }

  cacheSet("youtube", `dislike:${videoId}`, body, DISLIKE_CACHE_TTL_S);
  return { status: "ok", data: body };
}

/**
 * Dislike lookup that tells "RYD doesn't know this video" apart from "we could not
 * ask right now". Never throws.
 */
export async function lookupVideoDislike(videoId: string): Promise<DislikeLookup> {
  if (!VIDEO_ID_RE.test(videoId)) return { status: "unavailable" };

  const cached = cacheGet<YouTubeDislikeData>("youtube", `dislike:${videoId}`);
  if (cached !== undefined) return { status: "ok", data: cached };
  if (cacheGet<boolean>("youtube", `dislike-miss:${videoId}`) === true) {
    return { status: "unavailable" };
  }
  if (isDislikeBackoff()) return { status: "failed" };

  const pending = inFlight.get(videoId);
  if (pending) return pending;

  const promise = fetchDislike(videoId).finally(() => {
    inFlight.delete(videoId);
  });
  inFlight.set(videoId, promise);
  return promise;
}

/** Dislike data for one video, or null when it is unknown or could not be fetched. */
export async function getVideoDislike(videoId: string): Promise<YouTubeDislikeData | null> {
  const result = await lookupVideoDislike(videoId);
  return result.status === "ok" ? result.data : null;
}

/**
 * Batch fetch dislike data for multiple videos.
 * RYD has no batch endpoint, so this fans out in small groups.
 */
export async function getVideoDislikes(
  videoIds: string[]
): Promise<Map<string, YouTubeDislikeData>> {
  const results = new Map<string, YouTubeDislikeData>();
  const BATCH_SIZE = 10;

  for (let i = 0; i < videoIds.length; i += BATCH_SIZE) {
    const batch = videoIds.slice(i, i + BATCH_SIZE);
    await Promise.all(
      batch.map(async (videoId) => {
        const data = await getVideoDislike(videoId);
        if (data) results.set(videoId, data);
      })
    );

    // Small delay between batches to respect rate limits (pointless during a backoff).
    if (i + BATCH_SIZE < videoIds.length && !isDislikeBackoff()) {
      await new Promise((r) => setTimeout(r, 100));
    }
  }

  return results;
}
