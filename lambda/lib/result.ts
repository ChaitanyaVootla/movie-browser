/**
 * Per-source outcome vocabulary.
 *
 * Every source reports exactly one of these, so "is a scraper broken?" is a
 * GROUP BY away instead of a log-reading exercise. The distinctions matter:
 *
 *   ok          — got a value
 *   empty       — reached the right page, it has no score yet (new release, no reviews)
 *   not_found   — the source has no entry for this title (404, no search match)
 *   no_id       — we could not resolve an id to look the title up with
 *   blocked     — bot wall: 403/429/503, or a 2xx challenge page (IMDb's WAF answers 202 + empty body)
 *   http_error  — any other non-2xx
 *   parse_error — page fetched fine but the structure we parse is gone (selector rot — ALERT on this)
 *   timeout     — request exceeded its budget
 *   error       — anything else (bug, network)
 *   skipped     — not applicable (e.g. Letterboxd has no TV)
 *
 * `blocked` and `parse_error` are the two that mean "this source is broken and
 * needs a human"; the CloudWatch breakage metric filter keys on them.
 */
export type SourceStatus =
  | "ok"
  | "empty"
  | "not_found"
  | "no_id"
  | "blocked"
  | "http_error"
  | "parse_error"
  | "timeout"
  | "error"
  | "skipped";

export interface SourceResult {
  status: SourceStatus;
  ms: number;
  http?: number;
  url?: string;
  detail?: string;
}

/** Thrown inside a source to short-circuit with a specific status. */
export class SourceError extends Error {
  constructor(
    readonly status: SourceStatus,
    message: string,
    readonly http?: number,
    readonly url?: string
  ) {
    super(message);
    this.name = "SourceError";
  }
}

/** Is this status a transient failure (worth retrying soon) rather than a real answer? */
export function isTransient(status: SourceStatus): boolean {
  return status === "blocked" || status === "http_error" || status === "timeout" || status === "error";
}

/**
 * Run a source, timing it and converting any throw into a SourceResult.
 * The source returns its data plus the status it wants to report.
 */
export async function runSource<T>(
  fn: () => Promise<{ status: SourceStatus; data?: T; url?: string; detail?: string }>
): Promise<{ result: SourceResult; data?: T }> {
  const start = Date.now();
  try {
    const out = await fn();
    return {
      result: { status: out.status, ms: Date.now() - start, url: out.url, detail: out.detail },
      data: out.data,
    };
  } catch (error: unknown) {
    const ms = Date.now() - start;
    if (error instanceof SourceError) {
      return {
        result: { status: error.status, ms, http: error.http, url: error.url, detail: error.message },
      };
    }
    const message = error instanceof Error ? error.message : String(error);
    return { result: { status: "error", ms, detail: message.slice(0, 300) } };
  }
}
