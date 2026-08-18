/**
 * Relevance ranking for the search palette.
 *
 * THE PROBLEM THIS REPLACES: precedence in the palette was decided by SOURCE and
 * fixed DOM POSITION rather than by how well a result answers the query. Two
 * user-visible defects came out of that:
 *
 *  1. The Movies/Series groups were guarded by `!hasApiResults`, so the moment the
 *     TMDB `quickSearch` landed (~250ms) it UNMOUNTED our Postgres matches (~150ms).
 *     Typing "shan" showed Shang-Chi / Shangri-La for ~205ms and then replaced them
 *     with TMDB's "Shan" / "Xue Ding Shan". Same mechanism, minus the visible
 *     flicker, gave `starwars` → "Starwars: Goretech" and `9-1-1` → "1 Oktober jam
 *     9 malam di TV3.".
 *  2. The People group had no relevance gate and rendered FIRST, so weak substring
 *     person matches won: "inc" → Jennifer Inch, "the matrix" → Carlos Matrix,
 *     "wall-e" → Eli Wallach, "spiderman" → B Spiderman.
 *
 * Moving People last would have "fixed" (2) while breaking the person queries that
 * already worked ("tom holland", "cillian murphy"). Hence a score, not a reorder.
 *
 * Everything here is PURE and client-safe (no DB, no server imports) so it can run
 * in the palette component and be unit-tested directly — see
 * `palette-ranking.test.ts`, which encodes each reported case as a spec.
 */

export type RankableMediaType = "movie" | "series" | "person";

export interface Rankable {
  mediaType: RankableMediaType;
  /** Movie/series title, or person name. */
  title: string;
  popularity: number | null;
}

/**
 * Normalise to `[a-z0-9]` — drops case, spacing and punctuation so none of them can
 * decide relevance ("Shang-Chi" / "shang chi" / "shangchi" are one thing).
 *
 * This is the SAME normalisation the `idx_*_squash` Postgres indexes use; the SQL
 * side is pinned byte-for-byte by `fts-search.test.ts`. Keep them in step.
 */
export function squashText(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

/**
 * Drop a trailing "(YYYY)" release-year suffix.
 *
 * The palette's suggestion `label` is "Title (YYYY)", so without this the squashed
 * form of "Breaking Bad (2008)" is "breakingbad2008" and the squashed-EXACT tier can
 * never fire — `breakingbad` then tied with "Breaking Bad Wolf" and lost on group
 * declaration order. Deliberately anchored to the END and to 4 digits in parens, so
 * a title like "Blade Runner 2049" is untouched.
 */
export function stripYear(title: string): string {
  return title.replace(/\s*\(\d{4}\)\s*$/, "");
}

const norm = (value: string): string => value.toLowerCase().trim().replace(/\s+/g, " ");

/** Score tiers. Gaps are deliberate so a better KIND of match always wins outright. */
const EXACT = 100;
const SQUASHED_EXACT = 95;
const PREFIX_AT_WORD_END = 85; // "the matrix" in "The Matrix Reloaded"
const PREFIX_MID_WORD = 78; // "inc" in "Inception", "shan" in "Shang-Chi"
const WORD_PREFIX = 60; // "inc" in "Jennifer INCh" — a real but weak match
const CONTAINS = 40;
const SQUASHED_CONTAINS = 30;
const NO_MATCH = 0;

/**
 * How directly does `title` answer `query`? 0 means "not a match at all".
 *
 * The mid-word vs word-end distinction matters: for "star wars", "Star Wars:
 * Visions" (query ends at a boundary) is a better answer than "Star Warship"
 * (query ends mid-word), regardless of popularity.
 */
/**
 * Where does the query's prefix LAND in the title, ignoring punctuation?
 *
 * We consume alphanumerics from the title until we have matched the squashed query's
 * length, then look at the ORIGINAL next character. This lets a squashed prefix be
 * judged on the same word-boundary footing as a raw one — without it,
 * "Spiderman and Dog" (raw prefix, boundary) outranked "Spider-Man: Brand New Day"
 * (squashed prefix) purely because of a hyphen.
 */
function squashedPrefixLanding(title: string, squashedLength: number): "boundary" | "mid" | null {
  let matched = 0;
  for (let i = 0; i < title.length; i++) {
    if (!/[a-z0-9]/.test(title[i])) continue;
    matched++;
    if (matched === squashedLength) {
      const next = title.charAt(i + 1);
      return next && /[a-z0-9]/.test(next) ? "mid" : "boundary";
    }
  }
  return null;
}

/**
 * How directly does `title` answer `query`? 0 means "not a match at all".
 *
 * The boundary vs mid-word distinction is load-bearing: for "star wars", "Star Wars:
 * Visions" (query ends at a boundary) is a better answer than "Star Warship" (ends
 * mid-word), regardless of popularity. Punctuation must NOT decide it, so raw and
 * squashed prefixes are scored on the same boundary footing.
 */
export function matchScore(query: string, title: string): number {
  const q = norm(query);
  const t = norm(stripYear(title));
  if (!q || !t) return NO_MATCH;

  if (t === q) return EXACT;

  const qs = squashText(query);
  const ts = squashText(stripYear(title));
  if (qs && ts === qs) return SQUASHED_EXACT;

  if (t.startsWith(q)) {
    const next = t.charAt(q.length);
    return next && /[a-z0-9]/.test(next) ? PREFIX_MID_WORD : PREFIX_AT_WORD_END;
  }

  if (qs && ts.startsWith(qs)) {
    const landing = squashedPrefixLanding(t, qs.length);
    return landing === "mid" ? PREFIX_MID_WORD : PREFIX_AT_WORD_END;
  }

  // Query prefixes some LATER word ("inc" → "Jennifer Inch").
  if (t.split(/[^a-z0-9]+/).some((word) => word && word.startsWith(q))) return WORD_PREFIX;

  if (t.includes(q)) return CONTAINS;
  if (qs && ts.includes(qs)) return SQUASHED_CONTAINS;

  return NO_MATCH;
}

export interface RankedGroup<T extends Rankable> {
  key: string;
  /** Best member score — what the group is ordered by. */
  score: number;
  items: T[];
}

/**
 * Order groups by their best member, and members within a group by score then
 * popularity.
 *
 * DEMOTE, DO NOT DROP: a group whose every member scores 0 is pushed to the bottom
 * rather than removed. We cannot see WHY the backend matched a row — a person can
 * match through `person_aliases`, a title through `original_title` — so a 0 here
 * means "we can't explain this match", not "it is wrong". Dropping would silently
 * discard legitimate alias hits; demoting fixes the reported ordering problem
 * without throwing away backend knowledge the client doesn't have.
 */
export function orderGroups<T extends Rankable>(
  query: string,
  groups: Record<string, T[]>
): RankedGroup<T>[] {
  const ranked: RankedGroup<T>[] = [];

  for (const [key, items] of Object.entries(groups)) {
    if (!items?.length) continue;

    const scored = items.map((item) => ({ item, score: matchScore(query, item.title) }));
    const best = scored.reduce((max, s) => (s.score > max ? s.score : max), NO_MATCH);

    scored.sort((a, b) => b.score - a.score || (b.item.popularity ?? 0) - (a.item.popularity ?? 0));
    ranked.push({ key, score: best, items: scored.map((s) => s.item) });
  }

  // Stable within equal scores: preserve the caller's group order.
  return ranked.sort((a, b) => b.score - a.score);
}

/** Stable identity for de-duplicating the same title arriving from two sources. */
export function dedupeKey(mediaType: string, id: number | string): string {
  return `${mediaType}:${id}`;
}
