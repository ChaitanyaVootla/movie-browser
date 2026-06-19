import type { ReviewDTO } from "@/types/social";

/**
 * De-dupe a review list by id, preserving order (first occurrence wins). Used by
 * the reviews-client island to fold the SSR anon seed into later loadReviews
 * pages without rendering the same review twice. Pure — kept in its own module
 * so it is unit-testable without importing the client island (which pulls in
 * next-auth and can't load under vitest's node env).
 */
export function dedupeById(reviews: ReviewDTO[]): ReviewDTO[] {
  const seen = new Set<number>();
  const out: ReviewDTO[] = [];
  for (const r of reviews) {
    if (seen.has(r.id)) continue;
    seen.add(r.id);
    out.push(r);
  }
  return out;
}
