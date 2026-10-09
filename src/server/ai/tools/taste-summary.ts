/**
 * Compact taste summary for Cue (pure). FULL scope is fine here: it is the
 * user's own data in their own chat. ~150 tokens. Numbers + labels only — the
 * agent phrases it (and must not tell the user what kind of person they are).
 */
import type { TasteCluster, TasteSnapshot } from "@/lib/taste/profile";
import type { RecItemDTO } from "@/lib/taste/recommend-types";

export interface CueTasteSummary {
  moods: string[];
  genres: string[];
  keywords: string[];
  directors: string[];
  languages: string[];
  axes: Array<{ axis: string; value: number; low: string; high: string }>;
  clusters: Array<{ label: string; share: number; medoid: { id: number; mediaType: "movie" | "series"; title: string } }>;
  basedOnTitles: number;
}

const labels = (xs: ReadonlyArray<{ label: string }> | undefined, n: number) =>
  (xs ?? []).slice(0, n).map((x) => x.label);

export function buildCueTasteSummary(
  snapshot: TasteSnapshot | null,
  clusters: readonly TasteCluster[]
): CueTasteSummary | null {
  if (!snapshot || snapshot.positiveCount === 0) return null;
  return {
    moods: labels(snapshot.moods, 5),
    genres: labels(snapshot.facets.genre, 3),
    keywords: labels(snapshot.facets.keyword, 3),
    directors: labels(snapshot.facets.director, 3),
    languages: labels(snapshot.facets.language, 2),
    axes: snapshot.axes.map((a) => ({
      axis: a.key,
      value: Math.round(a.value * 100) / 100,
      low: a.lowLabel,
      high: a.highLabel,
    })),
    clusters: [...clusters]
      .sort((a, b) => b.importance - a.importance)
      .slice(0, 4)
      .map((c) => ({
        label: c.label,
        share: Math.round(c.importance * 100) / 100,
        medoid: { id: c.medoid.tmdbId, mediaType: c.medoid.mediaType, title: c.medoid.title },
      })),
    basedOnTitles: snapshot.positiveCount,
  };
}

/** One recommendation as the agent sees it (ids exact, reason pre-phrased). */
export function toCueRec(it: RecItemDTO) {
  const e = it.explanation;
  return {
    id: it.id,
    mediaType: it.mediaType,
    title: it.title,
    year: it.releaseDate ? it.releaseDate.slice(0, 4) : null,
    rating: it.voteAverage != null ? Math.round(it.voteAverage * 10) / 10 : null,
    genres: it.genres.slice(0, 3),
    reason: e ? (e.kind === "because" ? `because they loved ${e.anchor.title}` : e.label) : null,
  };
}
