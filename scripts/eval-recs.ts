/**
 * Offline evaluation of taste recommendations (READ-ONLY, local dev DB only).
 * Spec docs/superpowers/specs/2026-10-09-taste-recommendations-design.md §3.10.
 *
 * Leave-last-k-out: for every user with ≥ MIN_POSITIVES positive titles, hold out
 * the K most recent positives, rebuild centroid + clusters from the remaining
 * signals with the pure taste functions, score the embedded catalog (exact JS
 * cosine — offline, no ANN), exclude everything the user still engaged with, and
 * compare ranking variants:
 *
 *   popular                 popularity only (sanity baseline)
 *   centroid                Rocchio centroid relevance, no clusters, no diversity
 *   clusters                max-over-clusters relevance, no diversity
 *   clusters+mmr            + MMR (λ = 0.7)
 *   clusters+mmr+calib      + Steck genre calibration (the shipped variant)
 *
 * Metrics @10: hit rate, recall, nDCG (binary), catalog coverage, novelty
 * (mean −log2 popularity share), intra-list diversity (mean pairwise 1 − cos).
 *
 *   DATABASE_URL='postgresql://dev:dev@localhost:5436/moviebrowser' npx tsx scripts/eval-recs.ts [--k=3]
 */
import { prisma } from "@/server/db/postgres";
import { fetchTasteSignals } from "@/server/db/postgres/social/taste";
import { fetchCandidateDetails } from "@/server/db/postgres/social/taste-recs";
import { foldSignals } from "@/lib/taste/weights";
import { rocchioCentroid } from "@/lib/taste/centroid";
import { wardClusters } from "@/lib/taste/cluster";
import { dot, l2Normalize, weightedMean } from "@/lib/taste/vector";
import {
  genreDistribution,
  greedySelect,
  scoreCandidates,
  type RecCandidate,
  type RecCluster,
  type ScoredCandidate,
} from "@/lib/taste/recommend";
import { REC_MIN_VOTES_MOVIE, REC_MIN_VOTES_SERIES } from "@/lib/taste/recommend-constants";
import type { TitleSignals } from "@/lib/taste/types";

const URL_ = process.env.DATABASE_URL ?? "";
if (!URL_.includes("5436")) {
  console.error("Refusing to run: DATABASE_URL must point at the local dev DB (:5436).");
  process.exit(1);
}
const K = Number(process.argv.find((a) => a.startsWith("--k="))?.slice(4) ?? 3);
const N = 10;
const MIN_POSITIVES = 8;
const CATALOG_CAP = 20_000;

type Variant = "popular" | "centroid" | "clusters" | "clusters+mmr" | "clusters+mmr+calib";
const VARIANTS: Variant[] = ["popular", "centroid", "clusters", "clusters+mmr", "clusters+mmr+calib"];

function lastSignalAt(s: TitleSignals): number {
  return Math.max(s.rating?.ratedAt.getTime() ?? 0, s.watches.lastAt.all?.getTime() ?? 0);
}

function ndcg(list: string[], relevant: Set<string>): number {
  let dcg = 0;
  list.forEach((k, i) => {
    if (relevant.has(k)) dcg += 1 / Math.log2(i + 2);
  });
  let idcg = 0;
  for (let i = 0; i < Math.min(relevant.size, list.length); i++) idcg += 1 / Math.log2(i + 2);
  return idcg > 0 ? dcg / idcg : 0;
}

function ild(items: ScoredCandidate[]): number {
  if (items.length < 2) return 0;
  let s = 0;
  let n = 0;
  for (let i = 0; i < items.length; i++)
    for (let j = i + 1; j < items.length; j++) {
      s += 1 - dot(items[i].unit, items[j].unit);
      n++;
    }
  return s / n;
}

async function loadCatalog(): Promise<RecCandidate[]> {
  const ids = async (table: "movies" | "series", fk: string, floor: number) =>
    (
      await prisma.$queryRawUnsafe<Array<{ id: number }>>(
        `SELECT t.id FROM ${table} t WHERE t.embedding IS NOT NULL AND t.adult IS NOT TRUE
           AND EXISTS (SELECT 1 FROM ratings r WHERE r.${fk} = t.id
             AND r.source_id = (SELECT id FROM data_sources WHERE slug = 'tmdb') AND r.vote_count >= $1)
         ORDER BY t.popularity DESC NULLS LAST LIMIT ${CATALOG_CAP}`,
        floor
      )
    ).map((r) => r.id);
  const [m, s] = await Promise.all([
    ids("movies", "movie_id", REC_MIN_VOTES_MOVIE),
    ids("series", "series_id", REC_MIN_VOTES_SERIES),
  ]);
  const [movies, series] = await Promise.all([fetchCandidateDetails("movies", m), fetchCandidateDetails("series", s)]);
  return [...movies, ...series].filter((c) => c.embedding.length > 0);
}

async function main() {
  const catalog = await loadCatalog();
  const byKey = new Map(catalog.map((c) => [c.key, c]));
  const popTotal = catalog.reduce((s, c) => s + Math.max(0, c.popularity ?? 0), 0) || 1;
  const users = await prisma.user.findMany({ select: { id: true, username: true } });
  console.log(`catalog: ${catalog.length} embedded titles (vote floor ${REC_MIN_VOTES_MOVIE}/${REC_MIN_VOTES_SERIES}); K=${K}, N=${N}`);

  const agg = new Map<Variant, { hit: number; recall: number; ndcg: number; novelty: number; ild: number; seen: Set<string> }>();
  for (const v of VARIANTS) agg.set(v, { hit: 0, recall: 0, ndcg: 0, novelty: 0, ild: 0, seen: new Set() });
  let evaluated = 0;
  const now = new Date();

  for (const u of users) {
    const signals = await fetchTasteSignals(u.id);
    const positives = foldSignals(signals, "full", now).titles.filter((t) => t.weight > 0);
    if (positives.length < MIN_POSITIVES) continue;
    const posKeys = new Set(positives.map((p) => p.key));
    // Hold out the K most recent positives that the catalog can actually return.
    const heldOut = signals
      .filter((s) => posKeys.has(s.key) && byKey.has(s.key))
      .sort((a, b) => lastSignalAt(b) - lastSignalAt(a))
      .slice(0, K)
      .map((s) => s.key);
    if (heldOut.length === 0) continue;
    const held = new Set(heldOut);
    const train = signals.filter((s) => !held.has(s.key));
    const folded = foldSignals(train, "full", now).titles;

    const embedded = folded
      .map((t) => {
        const c = byKey.get(t.key);
        return c ? { key: t.key, weight: t.weight, vector: c.embedding } : null;
      })
      .filter((x): x is { key: string; weight: number; vector: number[] } => x !== null);
    const { centroid, negCentroid } = rocchioCentroid(embedded);
    if (!centroid) continue;
    const clustersRaw = wardClusters(embedded.filter((e) => e.weight > 0)).slice(0, 3);
    const clusters: RecCluster[] = clustersRaw
      .map((c, index) => {
        const mean = weightedMean(
          c.memberKeys.map((k) => ({ vector: byKey.get(k)?.embedding ?? [], weight: 1 })).filter((x) => x.vector.length)
        );
        const vector = mean ? l2Normalize(mean) : null;
        const medoid = byKey.get(c.medoidKey);
        return vector && medoid
          ? { index, importance: c.importance, label: "", medoid: { mediaType: medoid.mediaType, id: medoid.id, title: medoid.title, posterPath: null }, vector }
          : null;
      })
      .filter((c): c is RecCluster => c !== null);

    const engaged = new Set(train.map((s) => s.key));
    const pool = catalog.filter((c) => !engaged.has(c.key));
    const target = genreDistribution(
      folded.filter((t) => t.weight > 0).map((t) => ({ genres: byKey.get(t.key)?.genres ?? [], weight: t.weight }))
    );
    const user = { clusters, centroid, negCentroid };
    const withClusters = scoreCandidates(pool, user);
    const lists: Record<Variant, ScoredCandidate[]> = {
      popular: [...withClusters].sort((a, b) => (b.popularity ?? 0) - (a.popularity ?? 0)).slice(0, N),
      centroid: scoreCandidates(pool, user, { useClusters: false }).slice(0, N),
      clusters: withClusters.slice(0, N),
      "clusters+mmr": greedySelect(withClusters, { k: N }),
      "clusters+mmr+calib": greedySelect(withClusters, { k: N, calibrationTarget: target }),
    };
    for (const v of VARIANTS) {
      const keys = lists[v].map((c) => c.key);
      const hits = keys.filter((k) => held.has(k)).length;
      const a = agg.get(v);
      if (!a) continue;
      a.hit += hits > 0 ? 1 : 0;
      a.recall += hits / held.size;
      a.ndcg += ndcg(keys, held);
      a.novelty +=
        lists[v].reduce((s, c) => s - Math.log2(Math.max(1e-9, (c.popularity ?? 0) / popTotal)), 0) /
        Math.max(1, lists[v].length);
      a.ild += ild(lists[v]);
      keys.forEach((k) => a.seen.add(k));
    }
    evaluated++;
    console.log(`  user ${u.username ?? u.id}: ${positives.length} positives, held out ${heldOut.length}, pool ${pool.length}`);
  }

  if (evaluated === 0) {
    console.log("No user had enough positives to evaluate.");
    return;
  }
  console.log(`\nusers evaluated: ${evaluated}`);
  console.log("variant               hit@10  recall@10  nDCG@10  coverage  novelty  ILD");
  for (const v of VARIANTS) {
    const a = agg.get(v);
    if (!a) continue;
    const f = (x: number) => (x / evaluated).toFixed(3);
    console.log(
      `${v.padEnd(22)}${f(a.hit).padStart(6)}  ${f(a.recall).padStart(9)}  ${f(a.ndcg).padStart(7)}  ${(a.seen.size / catalog.length).toFixed(3).padStart(8)}  ${f(a.novelty).padStart(7)}  ${f(a.ild)}`
    );
  }
}

main()
  .catch((e: unknown) => {
    console.error(e instanceof Error ? e.message : String(e));
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
