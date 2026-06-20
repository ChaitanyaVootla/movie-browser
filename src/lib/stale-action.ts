/**
 * Stale server-action self-healing.
 *
 * Server action IDs are baked per build. A tab loaded before a deploy holds
 * old IDs; its action POSTs hit the new server and fail with 404
 * "Server action not found" (observed Jun 11 2026: continue-watching → series
 * page → getSeason POST 404 → route error boundary killed the page; a manual
 * refresh fixed it). This repo deploys frequently, so long-open tabs WILL hit
 * this. The correct remedy is exactly what users do by hand: reload once so
 * the client picks up the new build's action IDs.
 */

const RELOAD_GUARD_KEY = "stale-action-reload-at";
const RELOAD_GUARD_WINDOW_MS = 60_000;

/** Matches the failure shapes Next emits for unknown action IDs. */
export function isStaleServerActionError(error: unknown): boolean {
  const name = error instanceof Error ? error.name : "";
  const message =
    error instanceof Error ? error.message : typeof error === "string" ? error : "";
  return (
    // Next 16 throws this NAMED error on an unknown action id (the actual prod
    // shape — was previously MISSED, so the self-heal reload never fired and
    // ratings/reviews stayed broken on stale-edge pages, e.g. mortal-kombat-ii).
    name === "UnrecognizedActionError" ||
    message.includes("UnrecognizedActionError") ||
    message.includes("was not found on the server") ||
    message.includes("Server action not found") ||
    message.includes("Failed to find Server Action") ||
    // Minified prod builds sometimes surface only the generic wrapper:
    message.includes("unexpected response from server")
  );
}

/**
 * Reload the page to pick up fresh action IDs — at most once per minute
 * (sessionStorage guard) so a genuinely broken deploy can't reload-loop.
 * Returns true if a reload was triggered.
 */
export function recoverFromStaleAction(): boolean {
  try {
    const last = Number(sessionStorage.getItem(RELOAD_GUARD_KEY) || 0);
    if (Date.now() - last < RELOAD_GUARD_WINDOW_MS) return false;
    sessionStorage.setItem(RELOAD_GUARD_KEY, String(Date.now()));
    window.location.reload();
    return true;
  } catch {
    return false;
  }
}
