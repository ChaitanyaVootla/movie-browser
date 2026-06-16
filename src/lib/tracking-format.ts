import type { DiaryEntryDTO } from "@/types/social";

/** "S3E4" code. */
export function episodeCode(seasonNumber: number, episodeNumber: number): string {
  return `S${seasonNumber}E${episodeNumber}`;
}

/** Stable key for watched-episode sets. */
export function episodeKey(seasonNumber: number, episodeNumber: number): string {
  return `${seasonNumber}:${episodeNumber}`;
}

/** Today's date as the input[type=date] value, in the user's local timezone. */
export function todayISODate(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** "June 2026" month label from an ISO datetime. */
export function monthLabel(isoDate: string): string {
  return new Date(isoDate).toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

export interface DiaryMonthGroup {
  /** "2026-06" — stable group key. */
  key: string;
  label: string;
  entries: DiaryEntryDTO[];
}

/**
 * Group dated diary entries by calendar month, preserving input (newest-first)
 * order. Entries with null watchedAt must be filtered out by the caller
 * (they render in the collapsed backfill section).
 */
export function groupDiaryByMonth(entries: DiaryEntryDTO[]): DiaryMonthGroup[] {
  const groups: DiaryMonthGroup[] = [];
  for (const entry of entries) {
    if (!entry.watchedAt) continue;
    const key = entry.watchedAt.slice(0, 7);
    const last = groups[groups.length - 1];
    if (last && last.key === key) {
      last.entries.push(entry);
    } else {
      groups.push({ key, label: monthLabel(entry.watchedAt), entries: [entry] });
    }
  }
  return groups;
}

/**
 * Locale-aware compact count for social-proof badges ("1.2K", "5M", lakhs in
 * `en-IN`). Use everywhere a count is shown on a card/carousel — never hardcode
 * K/M (the YouTube-lakh i18n gotcha). Falls back to the plain number on error.
 */
export function formatCompactCount(n: number, locale?: string): string {
  try {
    return new Intl.NumberFormat(locale, {
      notation: "compact",
      maximumFractionDigits: 1,
    }).format(n);
  } catch {
    return String(n);
  }
}

/** Username rules shared with the claim form: 3–20 chars, a–z 0–9 _ . */
export const USERNAME_PATTERN = /^[a-z0-9_]{3,20}$/;

export function normalizeUsername(raw: string): string {
  return raw.trim().toLowerCase();
}

export function isValidUsername(raw: string): boolean {
  return USERNAME_PATTERN.test(raw);
}
