/**
 * "Would I like X?" (taste v2 §5.3, Cue `explain_title_fit`). FULL scope, owner
 * only (the user's own chat). Deterministic: stored embeddings + catalog joins,
 * no LLM and no embedding calls.
 *
 * The title's stored embedding is projected into the SAME space as the user's
 * stored centroid (`resolveStoredSpace`). Then it is compared against the
 * centroid, the cluster means (members projected the same way) and the top
 * positives, which are the same anchors the recommender uses (`foldSignals`
 * top REC_MAX_ANCHORS). Facets are the title's values that the user's profile
 * lifts. Axis positions put the title on the user's own axes.
 *
 * `verdictBucket` is a number bucket about the TITLE's distance, never a label
 * for the person (Fable rule). It is relative: "closer to the centroid than N%
 * of their own favourites", so it reads the same in raw and centered space.
 */
import { REC_MAX_ANCHORS } from "@/lib/taste/recommend-constants";
import { tasteWindow } from "@/lib/taste/compatibility";
import { percentileOf } from "@/lib/taste/axes";
import { cosineSimilarity, l2Normalize } from "@/lib/taste/vector";
import { projectAll, resolveStoredSpace, windowed } from "@/lib/taste/space";
import { foldSignals } from "@/lib/taste/weights";
import type { TasteSnapshot } from "@/lib/taste/profile";
import { titleKey, type CatalogQuantiles, type TasteMediaType, type TitleKey, type TitleMeta } from "@/lib/taste/types";
import { prisma } from "@/server/db/postgres";
import {
  fetchTasteSignals,
  fetchTitleEmbeddings,
  fetchTitleMeta,
  isAdultKeyword,
} from "@/server/db/postgres/social/taste";
import { fetchAnchorInfo } from "@/server/db/postgres/social/taste-recs";
import { getBaseline } from "./baseline-cache";
import { getTasteClusters, getTasteProfile, getTasteSpace, getTasteVectors } from "./index";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type FitExclusion = null | "watched" | "rated" | "watchlisted" | "dismissed";
export type FitVerdict = "very close" | "close" | "near" | "far" | "off";

export interface FitAnchor {
  key: TitleKey;
  title: string;
  weight: number;
  /** Projected into the user's space. */
  embedding: number[];
}

export interface TitleFitInput {
  /** The title's embedding projected into the user's space (null = not embedded). */
  embedding: number[] | null;
  meta: TitleMeta;
  centroid: number[] | null;
  negCentroid: number[] | null;
  clusters: Array<{ label: string; mean: number[] }>;
  anchors: FitAnchor[];
  snapshot: TasteSnapshot;
  catalog: CatalogQuantiles | null;
  excluded: FitExclusion;
  /** Fallback cosine window (too few anchors for a percentile). */
  window: { lo: number; hi: number };
}

export interface TitleFitDTO {
  title: { mediaType: TasteMediaType; id: number; title: string; year: number | null };
  excluded: FitExclusion;
  /** Cosine to the taste centroid (null = title has no embedding). */
  tasteCos: number | null;
  /** Share of the user's own favourites that sit FARTHER from the centroid than this title (0-100). */
  closerThanFavouritesPct: number | null;
  nearestCluster: { label: string; cos: number } | null;
  anchors: Array<{ title: string; cos: number }>;
  sharedFacets: { genres: string[]; moods: string[]; keywords: string[]; people: string[] };
  axes: Array<{ axis: string; low: string; high: string; title: number; you: number }>;
  negativeCos: number | null;
  verdictBucket: FitVerdict | null;
}

export type ExplainFitResult =
  | { ok: true; fit: TitleFitDTO }
  | { ok: false; error: "no_profile" | "not_found" };

// ---------------------------------------------------------------------------
// Pure core
// ---------------------------------------------------------------------------

const MIN_ANCHORS_FOR_PERCENTILE = 5;
const MAX_FIT_ANCHORS = 3;
const MAX_FACETS = 4;
const round3 = (x: number) => Math.round(x * 1000) / 1000;
const round2 = (x: number) => Math.round(x * 100) / 100;

/** Mean direction of a cluster's member vectors (null for none / degenerate). */
export function clusterMean(embeddings: readonly number[][]): number[] | null {
  if (embeddings.length === 0) return null;
  const dims = embeddings[0].length;
  const sum = new Array<number>(dims).fill(0);
  for (const e of embeddings) {
    if (e.length !== dims) continue;
    for (let i = 0; i < dims; i++) sum[i] += e[i];
  }
  return l2Normalize(sum);
}

/**
 * Bucket from p = share of favourites farther from the centroid than the title.
 * A title closer to their dislikes than to their taste, and outside the bulk
 * of their favourites, is "off".
 */
export function verdictFromPercentile(p: number, tasteCos: number, negativeCos: number | null): FitVerdict {
  if (p >= 0.5) return "very close";
  if (p >= 0.2) return "close";
  if (p >= 0.05) return "near";
  const nearerToDislikes = negativeCos !== null && negativeCos > tasteCos;
  return tasteCos > 0 && !nearerToDislikes ? "far" : "off";
}

function verdictFromWindow(w: number): FitVerdict {
  if (w >= 0.7) return "very close";
  if (w >= 0.45) return "close";
  if (w >= 0.25) return "near";
  if (w > 0) return "far";
  return "off";
}

const EMOTIONAL: Record<string, number> = { light: 0, medium: 0.5, heavy: 1 };
const TONE: Record<string, number> = { light: 0, mixed: 0.5, dark: 1 };

/** The title's own position on the axes that make sense for ONE title (0-1, same orientation as the user's). */
function titleAxisValues(meta: TitleMeta, catalog: CatalogQuantiles | null): Map<string, number> {
  const out = new Map<string, number>();
  if (catalog && meta.popularity !== null && catalog.popularity.length >= 2) {
    out.set("mainstream", 1 - percentileOf(meta.popularity, catalog.popularity));
  }
  if (catalog && meta.year !== null && catalog.year.length >= 2) {
    out.set("era", percentileOf(meta.year, catalog.year));
  }
  const parts = [
    meta.mood.emotional !== null ? EMOTIONAL[meta.mood.emotional] : undefined,
    meta.mood.tone !== null ? TONE[meta.mood.tone] : undefined,
  ].filter((x): x is number => x !== undefined);
  if (parts.length) out.set("weight", parts.reduce((a, b) => a + b, 0) / parts.length);
  return out;
}

function sharedLabels(
  lifted: ReadonlyArray<{ key: string; label: string }>,
  titleFacets: TitleMeta["facets"],
  types: ReadonlyArray<TitleMeta["facets"][number]["type"]>
): string[] {
  const own = new Set(titleFacets.filter((f) => types.includes(f.type)).map((f) => f.key));
  return lifted
    .filter((f) => own.has(f.key) && !isAdultKeyword(f.label))
    .map((f) => f.label)
    .slice(0, MAX_FACETS);
}

export function computeTitleFit(input: TitleFitInput): TitleFitDTO {
  const { embedding, meta, centroid, negCentroid, snapshot } = input;
  const cos = (v: number[] | null) => (embedding && v && v.length === embedding.length ? cosineSimilarity(embedding, v) : null);

  const tasteCos = cos(centroid);
  const negativeCos = cos(negCentroid);

  let nearest: { label: string; cos: number } | null = null;
  for (const [i, c] of input.clusters.entries()) {
    const v = cos(c.mean);
    if (v === null) continue;
    if (nearest === null || v > nearest.cos) {
      nearest = { label: isAdultKeyword(c.label) ? `Cluster ${i + 1}` : c.label, cos: v };
    }
  }

  const scoredAnchors = embedding
    ? input.anchors
        .filter((a) => a.key !== meta.key && a.embedding.length === embedding.length)
        .map((a) => ({ title: a.title, cos: cosineSimilarity(embedding, a.embedding) }))
        .sort((a, b) => b.cos - a.cos)
    : [];

  // Percentile of the title among the user's own favourites (distance to centroid).
  let percentile: number | null = null;
  if (tasteCos !== null && centroid) {
    const favCos = input.anchors
      .filter((a) => a.key !== meta.key && a.embedding.length === centroid.length)
      .map((a) => cosineSimilarity(a.embedding, centroid));
    if (favCos.length >= MIN_ANCHORS_FOR_PERCENTILE) {
      percentile = favCos.filter((c) => c <= tasteCos).length / favCos.length;
    }
  }

  let verdictBucket: FitVerdict | null = null;
  if (tasteCos !== null) {
    verdictBucket =
      percentile !== null
        ? verdictFromPercentile(percentile, tasteCos, negativeCos)
        : verdictFromWindow(windowed(tasteCos, input.window));
  }

  const titleAxes = titleAxisValues(meta, input.catalog);
  const axes = snapshot.axes
    .filter((a) => titleAxes.has(a.key))
    .map((a) => ({
      axis: a.key,
      low: a.lowLabel,
      high: a.highLabel,
      title: round2(titleAxes.get(a.key) ?? 0),
      you: round2(a.value),
    }));

  return {
    title: { mediaType: meta.ref.mediaType, id: meta.ref.tmdbId, title: meta.ref.title, year: meta.year },
    excluded: input.excluded,
    tasteCos: tasteCos === null ? null : round3(tasteCos),
    closerThanFavouritesPct: percentile === null ? null : Math.round(percentile * 100),
    nearestCluster: nearest ? { label: nearest.label, cos: round3(nearest.cos) } : null,
    anchors: scoredAnchors.slice(0, MAX_FIT_ANCHORS).map((a) => ({ title: a.title, cos: round3(a.cos) })),
    sharedFacets: {
      genres: sharedLabels(snapshot.facets.genre, meta.facets, ["genre"]),
      moods: sharedLabels(snapshot.moods, meta.facets, ["mood", "theme"]),
      keywords: sharedLabels(snapshot.facets.keyword, meta.facets, ["keyword"]),
      people: sharedLabels([...snapshot.facets.director, ...snapshot.facets.cast], meta.facets, ["director", "cast"]),
    },
    axes,
    negativeCos: negativeCos === null ? null : round3(negativeCos),
    verdictBucket,
  };
}

// ---------------------------------------------------------------------------
// Loader (DB reads only)
// ---------------------------------------------------------------------------

function splitKeys(keys: Iterable<TitleKey>): { movieIds: number[]; seriesIds: number[] } {
  const movieIds: number[] = [];
  const seriesIds: number[] = [];
  for (const k of keys) {
    const id = Number(k.slice(2));
    if (!Number.isInteger(id)) continue;
    (k.startsWith("m:") ? movieIds : seriesIds).push(id);
  }
  return { movieIds, seriesIds };
}

async function isDismissed(userId: number, mediaType: TasteMediaType, id: number): Promise<boolean> {
  try {
    const row = await prisma.recFeedback.findFirst({
      where: { userId, kind: "DISMISS", ...(mediaType === "movie" ? { movieId: id } : { seriesId: id }) },
      select: { id: true },
    });
    return row !== null;
  } catch {
    return false; // table not migrated yet / transient — dismissal is informational only
  }
}

/**
 * Explain how one catalog title sits against the user's FULL taste profile.
 * Throws only on unexpected DB errors (the tool turns that into `{ error }`).
 */
export async function explainTitleFitForUser(
  userId: number,
  ref: { mediaType: TasteMediaType; id: number }
): Promise<ExplainFitResult> {
  const key = titleKey(ref.mediaType, ref.id);
  const [snapshot, vectors, current, clusters, signals] = await Promise.all([
    getTasteProfile(userId, { scope: "full" }),
    getTasteVectors(userId),
    getTasteSpace(),
    getTasteClusters(userId),
    fetchTasteSignals(userId),
  ]);
  if (!snapshot || snapshot.positiveCount === 0) return { ok: false, error: "no_profile" };

  const titleMeta = await fetchTitleMeta(
    ref.mediaType === "movie" ? [ref.id] : [],
    ref.mediaType === "series" ? [ref.id] : []
  );
  const meta = titleMeta.meta.get(key);
  if (!meta) return { ok: false, error: "not_found" }; // not in the catalog yet, or adult

  // Exclusion status (strongest relationship first).
  const own = signals.find((s) => s.key === key);
  let excluded: FitExclusion = null;
  if (own && (own.watches.count.all > 0 || own.progress)) excluded = "watched";
  else if (own?.rating) excluded = "rated";
  else if (own?.watchlistedAt) excluded = "watchlisted";
  else if (await isDismissed(userId, ref.mediaType, ref.id)) excluded = "dismissed";

  // Anchors = the recommender's anchors (top positives by weight).
  const positives = foldSignals(signals, "full", new Date())
    .titles.filter((t) => t.weight > 0)
    .sort((a, b) => b.weight - a.weight || a.key.localeCompare(b.key))
    .slice(0, REC_MAX_ANCHORS);

  // Compare only in the space the stored vectors live in.
  const space = vectors.centroid ? resolveStoredSpace(vectors.space, current) : null;
  const memberKeys = clusters.flatMap((c) => c.memberKeys);
  const embKeys = new Set<TitleKey>([key, ...positives.map((p) => p.key), ...memberKeys]);
  const anchorIds = splitKeys(positives.map((p) => p.key));
  const embIds = splitKeys(embKeys);
  const [rawEmbeddings, info, base] = await Promise.all([
    space ? fetchTitleEmbeddings(embIds.movieIds, embIds.seriesIds) : Promise.resolve(new Map<TitleKey, number[]>()),
    fetchAnchorInfo(anchorIds.movieIds, anchorIds.seriesIds),
    getBaseline(new Map()),
  ]);
  const embeddings = space ? projectAll(space, rawEmbeddings) : new Map<TitleKey, number[]>();

  const anchors: FitAnchor[] = [];
  for (const p of positives) {
    const a = info.get(p.key);
    const e = embeddings.get(p.key);
    if (!a || !e) continue; // adult / missing / not embedded → never cited
    anchors.push({ key: p.key, title: a.title, weight: p.weight, embedding: e });
  }

  const clusterMeans = clusters
    .map((c) => ({
      label: c.label,
      mean: clusterMean(c.memberKeys.map((k) => embeddings.get(k)).filter((e): e is number[] => e !== undefined)),
    }))
    .filter((c): c is { label: string; mean: number[] } => c.mean !== null);

  const fit = computeTitleFit({
    embedding: embeddings.get(key) ?? null,
    meta,
    centroid: space ? vectors.centroid : null,
    negCentroid: space ? vectors.negCentroid : null,
    clusters: clusterMeans,
    anchors,
    snapshot,
    catalog: base.catalog,
    excluded,
    window: tasteWindow(space?.kind ?? "raw"),
  });
  return { ok: true, fit };
}
