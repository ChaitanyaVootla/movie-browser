/**
 * LLM path parsing — pure, no I/O.
 *
 * Maps request paths to a small, closed set of markdown targets. The proxy uses
 * `isMarkdownRequest` / `markdownPathToTarget`; the `/api/md` route handler uses
 * `parseLlmPath` to dispatch. Keep this module free of any DB / network access.
 */

/** A resolved markdown target. Closed set — the route handler dispatches on `kind`. */
export type LlmTarget =
  | { kind: "movie" | "series" | "person"; id: number }
  | { kind: "browse" }
  | { kind: "topic"; topicKey: string }
  | { kind: "home" }
  | { kind: "static"; slug: string } // privacy | terms | content-policy | about | topics
  | { kind: "search" };

/** Static page slugs that have a markdown twin. `topics` renders a topics index. */
const STATIC_SLUGS = new Set(["privacy", "terms", "content-policy", "about", "topics"]);

/** Strip a leading/trailing slash and collapse to path segments. */
function segments(path: string): string[] {
  return path.split("/").filter((s) => s.length > 0);
}

/** Parse a numeric id from a `/type/{id}[/slug]` route. Returns null if not a positive int. */
function parseId(raw: string | undefined): number | null {
  if (!raw) return null;
  if (!/^\d+$/.test(raw)) return null;
  const id = Number(raw);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

/**
 * Parse the ORIGINAL path (no `.md` suffix, no query string) into a target,
 * or null if the path is not a supported markdown surface.
 */
export function parseLlmPath(path: string): LlmTarget | null {
  const parts = segments(path);

  // Home: "" or "/"
  if (parts.length === 0) return { kind: "home" };

  const [head, second] = parts;

  switch (head) {
    case "movie":
    case "series":
    case "person": {
      const id = parseId(second);
      if (id === null) return null;
      return { kind: head, id };
    }
    case "browse":
      return parts.length === 1 ? { kind: "browse" } : null;
    case "search":
      return parts.length === 1 ? { kind: "search" } : null;
    case "topics": {
      // "/topics" → index (rendered as a static topics list);
      // "/topics/<key>" → a single topic list.
      if (parts.length === 1) return { kind: "static", slug: "topics" };
      if (parts.length === 2 && second) return { kind: "topic", topicKey: second };
      return null;
    }
    default:
      if (parts.length === 1 && STATIC_SLUGS.has(head)) {
        return { kind: "static", slug: head };
      }
      return null;
  }
}

/**
 * True if a request pathname is a markdown request the proxy should hijack.
 * A `.md` suffix on any path, or the bare `/search.md` agent-search endpoint.
 */
export function isMarkdownRequest(pathname: string): boolean {
  return pathname.endsWith(".md") || pathname === "/search.md";
}

/**
 * Strip the `.md` suffix and normalise to the internal `p` value that
 * `parseLlmPath` understands. `/search.md` → `/search`, `/index.md` → `/`,
 * a bare `/.md` → `/`.
 */
export function markdownPathToTarget(pathname: string): string {
  if (pathname === "/search.md") return "/search";

  let p = pathname.endsWith(".md") ? pathname.slice(0, -".md".length) : pathname;

  // "/index.md" is the conventional home twin.
  if (p === "/index") p = "/";
  // A path that reduced to empty (was "/.md") is the home.
  if (p === "" || p === "/") return "/";

  return p;
}
