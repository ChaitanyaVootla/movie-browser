/**
 * Bucket-label formatting shared by the traffic sub-panels.
 *
 * ClickHouse returns a `toStartOfHour` bucket as a naive "YYYY-MM-DD HH:MM:SS"
 * string in UTC (no zone) and a `toDate` bucket as "YYYY-MM-DD". `new Date()`
 * parses the former as LOCAL time (wrong by the local offset) and the latter as
 * UTC midnight (renders the previous day west of UTC). Both are parsed
 * explicitly here, then formatted in the viewer's zone.
 */

export type BucketGranularity = "hour" | "day";

export function parseBucketTs(value: string, granularity: BucketGranularity): Date {
  if (granularity === "hour") {
    const iso = value.includes("T") ? value : value.replace(" ", "T");
    return new Date(iso.endsWith("Z") ? iso : `${iso}Z`);
  }
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T00:00:00`) : new Date(value);
}

/** Axis tick label. Long hourly ranges fall back to a date to avoid a tick mash. */
export function formatBucketLabel(
  value: string,
  granularity: BucketGranularity,
  pointCount: number
): string {
  const d = parseBucketTs(value, granularity);
  if (granularity === "hour") {
    return pointCount > 48
      ? d.toLocaleDateString(undefined, { month: "short", day: "numeric" })
      : d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  }
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/** Tooltip title — always fully qualified, since the axis label may be abbreviated. */
export function formatBucketTooltip(value: string, granularity: BucketGranularity): string {
  const d = parseBucketTs(value, granularity);
  return granularity === "hour"
    ? d.toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

/** Compact UA rendering for the cohort table: drop the boilerplate prefix. */
export function shortenUserAgent(ua: string, maxLength = 64): string {
  const trimmed = ua
    .replace(/^Mozilla\/5\.0 /, "")
    .replace(/ AppleWebKit\/[\d.]+ \(KHTML, like Gecko\)/, "")
    .replace(/ Safari\/[\d.]+$/, "");
  return trimmed.length > maxLength ? `${trimmed.slice(0, maxLength - 1)}…` : trimmed;
}
