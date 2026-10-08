import { dataLogger } from "@/lib/logger";

/**
 * Debug-level trace for the hydration hot path.
 *
 * These lines used to be bare `console.log`s, which bypass the Pino level: in
 * prod they fired on every detail-page render and every background refresh and
 * — together with similar-items/enrichment info logs — grew the unrotated
 * `~/.pm2/logs/next-out.log` to 7.7GB (~216MB/day, Oct 2026). Routed through
 * Pino at debug so dev (level debug) still shows them and prod (level info)
 * drops them before any string work beyond the template literal.
 */
export function hydrationDebug(...args: unknown[]): void {
  if (!dataLogger.isLevelEnabled("debug")) return;
  dataLogger.debug(args.map((a) => (typeof a === "string" ? a : String(a))).join(" "));
}
