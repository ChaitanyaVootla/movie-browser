/**
 * Taste latency + ANN over-fetch measurement (LOCAL ONLY — writes
 * user_taste_profiles rows in the target DB). Spec
 * docs/superpowers/specs/2026-10-10-taste-vector-upgrades.md §6.
 *
 *   DATABASE_URL='postgresql://dev:dev@localhost:5437/moviebrowser_eval' \
 *     npx tsx scripts/eval-taste-latency.ts
 *
 * 1. recompute every user with signals (recomputeTasteNow) → p50/p95;
 * 2. recs cold (cache cleared) and warm per user with a centroid → p50/p95;
 * 3. ANN over-fetch recall: for users with ≥10 positives, the share of the
 *    EXACT centered top-REC_POOL (scored over every eligible catalog title)
 *    that the ANN pipeline's top-(REC_POOL × f) contains, for several f, with
 *    and without the μ·q distance correction.
 */
import { prisma } from "@/server/db/postgres";
import { percentile } from "@/lib/taste/space";
import { rawRelevance } from "@/lib/taste/recommend";
import { l2Normalize, weightedMean } from "@/lib/taste/vector";
import { REC_ANN_PER_QUERY, REC_MAX_CLUSTER_QUERIES, REC_MIN_VOTES_MOVIE, REC_POOL } from "@/lib/taste/recommend-constants";

const URL_ = process.env.DATABASE_URL ?? "";
if (!/@(localhost|127\.0\.0\.1):(5436|5437)\//.test(URL_)) {
  console.error("Refusing to run: DATABASE_URL must point at localhost:5436 (dev) or :5437 (eval).");
  process.exit(1);
}

const stats = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return `n=${s.length} p50=${percentile(s, 0.5).toFixed(0)}ms p95=${percentile(s, 0.95).toFixed(0)}ms max=${(s.at(-1) ?? 0).toFixed(0)}ms`;
};

async function main() {
  const { recomputeTasteNow, getTasteClusters, getTasteVectors, getTasteSpace } = await import("@/server/services/taste");
  const { getRecommendationsForUser, clearRecsCache } = await import("@/server/services/taste/recommend");
  const { annCandidates, fetchRecExclusions, fetchCandidateDetails } = await import("@/server/db/postgres/social/taste-recs");
  const { fetchTitleEmbeddings } = await import("@/server/db/postgres/social/taste");
  const { projectAll } = await import("@/lib/taste/space");

  const users = await prisma.$queryRawUnsafe<Array<{ id: number }>>(
    `SELECT DISTINCT user_id AS id FROM (
       SELECT user_id FROM watch_events UNION SELECT user_id FROM user_ratings
       UNION SELECT user_id FROM watchlist UNION SELECT user_id FROM series_progress) u ORDER BY 1`
  );
  const space = await getTasteSpace();
  console.log(`users with signals: ${users.length}; space=${space.kind}`);

  // 1. recompute
  const rec: number[] = [];
  const positives = new Map<number, number>();
  for (const u of users) {
    const t = performance.now();
    const r = await recomputeTasteNow(u.id);
    rec.push(performance.now() - t);
    positives.set(u.id, r.full.positiveCount);
  }
  console.log(`recompute: ${stats(rec)}  (first call includes a cold baseline cache)`);

  // 2. recs cold / warm
  const withCentroid: number[] = [];
  for (const u of users) if ((await getTasteVectors(u.id)).centroid) withCentroid.push(u.id);
  const cold: number[] = [];
  const warm: number[] = [];
  const reasons = new Map<string, number>();
  for (const id of withCentroid) {
    clearRecsCache();
    let t = performance.now();
    const r = await getRecommendationsForUser(id);
    cold.push(performance.now() - t);
    reasons.set(r.reason, (reasons.get(r.reason) ?? 0) + 1);
    t = performance.now();
    await getRecommendationsForUser(id);
    warm.push(performance.now() - t);
  }
  console.log(`recs cold: ${stats(cold)}  reasons=${JSON.stringify(Object.fromEntries(reasons))}`);
  console.log(`recs warm: ${stats(warm)}`);

  // 3. over-fetch recall (movies, the large table)
  const eligible = await prisma.$queryRawUnsafe<Array<{ id: number }>>(
    `SELECT t.id FROM movies t WHERE t.embedding IS NOT NULL AND t.adult IS NOT TRUE
       AND EXISTS (SELECT 1 FROM ratings r WHERE r.movie_id = t.id
         AND r.source_id = (SELECT id FROM data_sources WHERE slug = 'tmdb') AND r.vote_count >= $1)`,
    REC_MIN_VOTES_MOVIE
  );
  const all = new Map<string, number[]>();
  for (let i = 0; i < eligible.length; i += 2000) {
    const chunk = await fetchCandidateDetails("movies", eligible.slice(i, i + 2000).map((r) => r.id));
    for (const c of chunk) {
      const p = space.project(c.embedding);
      if (p) all.set(c.key, p);
    }
  }
  const factors = [1, 1.5, 2, 3];
  const recall = new Map<string, number[]>();
  const annMs = new Map<number, number[]>();
  const PER_QUERY = (process.env.PER_QUERY ?? `${REC_ANN_PER_QUERY}`).split(",").map(Number);
  for (const id of withCentroid.filter((x) => (positives.get(x) ?? 0) >= 10)) {
    const [clusters, vectors, ex] = await Promise.all([getTasteClusters(id), getTasteVectors(id), fetchRecExclusions(id)]);
    if (!vectors.centroid) continue;
    const top = [...clusters].sort((a, b) => b.importance - a.importance).slice(0, REC_MAX_CLUSTER_QUERIES);
    const keys = top.flatMap((c) => c.memberKeys);
    const emb = projectAll(
      space,
      await fetchTitleEmbeddings(
        keys.filter((k) => k.startsWith("m:")).map((k) => Number(k.slice(2))),
        keys.filter((k) => k.startsWith("s:")).map((k) => Number(k.slice(2)))
      )
    );
    const clusterVecs = top
      .map((c) => weightedMean(c.memberKeys.map((k) => ({ vector: emb.get(k) ?? [], weight: 1 })).filter((x) => x.vector.length)))
      .map((m) => (m ? l2Normalize(m) : null))
      .filter((v): v is number[] => v !== null);
    const queries = [...clusterVecs, vectors.centroid];
    const excluded = new Set(ex.movieIds.map((m) => `m:${m}`));
    // exact top-REC_POOL by relevance over every eligible title
    const centroid = l2Normalize(vectors.centroid);
    const neg = vectors.negCentroid ? l2Normalize(vectors.negCentroid) : null;
    const exact = [...all.entries()]
      .filter(([k]) => !excluded.has(k))
      .map(([k, v]) => ({ k, r: rawRelevance(v, clusterVecs, centroid, neg).rel }))
      .sort((a, b) => b.r - a.r)
      .slice(0, REC_POOL)
      .map((x) => x.k);
    const exactSet = new Set(exact);
    const offsets = queries.map((q) => space.meanDot(q));
    for (const perQuery of PER_QUERY) {
    const t = performance.now();
    const hits = await annCandidates("movies", queries, { excludeIds: ex.movieIds, minVotes: REC_MIN_VOTES_MOVIE, perQuery });
    const ms = performance.now() - t;
    annMs.set(perQuery, [...(annMs.get(perQuery) ?? []), ms]);
    for (const corrected of [false, true]) {
      const best = new Map<string, number>();
      for (const h of hits) {
        const d = h.dist + (corrected ? (offsets[h.query] ?? 0) : 0);
        const k = `m:${h.id}`;
        if (!best.has(k) || d < (best.get(k) ?? Infinity)) best.set(k, d);
      }
      const ordered = [...best.entries()].sort((a, b) => a[1] - b[1]).map(([k]) => k);
      for (const f of factors) {
        const got = ordered.slice(0, Math.ceil(REC_POOL * f));
        // what the service keeps after the exact re-rank of `got`
        const kept = got
          .map((k) => ({ k, r: rawRelevance(all.get(k) ?? [], clusterVecs, centroid, neg).rel }))
          .sort((a, b) => b.r - a.r)
          .slice(0, REC_POOL);
        const inter = kept.filter((x) => exactSet.has(x.k)).length;
        const key = `k=${perQuery} ${corrected ? "μ·q-corrected" : "raw-dist"} f=${f}`;
        recall.set(key, [...(recall.get(key) ?? []), inter / Math.max(1, Math.min(REC_POOL, exact.length))]);
      }
    }
    }
  }
  for (const [k, xs] of annMs) console.log(`ANN movies k=${k} (≤${REC_MAX_CLUSTER_QUERIES + 1} queries + filter stage): ${stats(xs)}`);
  console.log(`over-fetch recall of the exact top-${REC_POOL} (movies, users ≥10 positives):`);
  for (const [k, xs] of recall) console.log(`  ${k.padEnd(22)} mean=${(xs.reduce((s, x) => s + x, 0) / xs.length).toFixed(3)} min=${Math.min(...xs).toFixed(3)} (n=${xs.length})`);
}

main()
  .catch((e: unknown) => {
    console.error(e instanceof Error ? e.stack ?? e.message : String(e));
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
