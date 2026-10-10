/**
 * Offline evaluation of taste recommendations (READ-ONLY, local DBs only).
 * Specs: docs/superpowers/specs/2026-10-09-taste-recommendations-design.md §3.10
 * and 2026-10-10-taste-vector-upgrades.md §5.
 *
 * Leave-last-K-out: for every user with ≥ --min-pos positive titles, hold out
 * the K most recent positives that the catalog can return, rebuild centroid +
 * clusters from the remaining signals with the pure taste functions IN EACH
 * EMBEDDING SPACE (raw / centered / whitened, from taste_baseline_meta), score
 * the embedded catalog exactly (JS cosine, no ANN), exclude everything the user
 * still engaged with, and compare:
 *
 *   popular                       popularity only
 *   <space>/centroid              Rocchio centroid relevance only
 *   <space>/clusters              max-over-clusters (+ small centroid term)
 *   <space>/clusters+mmr+calib    + MMR (λ) + Steck calibration (shipped shape)
 *   <space>/centroid+mmr+calib    centroid relevance + MMR + calibration
 *
 * Metrics @10: hit rate, recall, nDCG, coverage, novelty, intra-list diversity.
 * Also prints the calibration distributions (user↔user PUBLIC-centroid cosines,
 * split-half self-similarity, nearest-anchor cosines of recommended items), the
 * name/franchise-noise probe and co-occurrence viability counts.
 *
 *   DATABASE_URL='postgresql://dev:dev@localhost:5437/moviebrowser_eval' \
 *     npx tsx scripts/eval-recs.ts [--k=3] [--min-pos=10]
 *
 * Refuses anything that is not localhost:5436 (dev) or :5437 (eval container).
 */
import { prisma } from "@/server/db/postgres";
import { fetchTasteSignals, fetchTitleEmbeddings, readEmbeddingStats } from "@/server/db/postgres/social/taste";
import { fetchCandidateDetails } from "@/server/db/postgres/social/taste-recs";
import { foldSignals } from "@/lib/taste/weights";
import { rocchioCentroid } from "@/lib/taste/centroid";
import { wardClusters } from "@/lib/taste/cluster";
import { dot, l2Normalize, weightedMean } from "@/lib/taste/vector";
import { RAW_SPACE, makeTasteSpace, percentile, type TasteSpace } from "@/lib/taste/space";
import {
  genreDistribution,
  greedySelect,
  scoreCandidates,
  type RecCandidate,
  type RecCluster,
  type ScoredCandidate,
} from "@/lib/taste/recommend";
import { REC_MIN_VOTES_MOVIE, REC_MIN_VOTES_SERIES, REC_POOL } from "@/lib/taste/recommend-constants";
import type { TitleKey, TitleSignals, WeightedTitle } from "@/lib/taste/types";

const URL_ = process.env.DATABASE_URL ?? "";
if (!/@(localhost|127\.0\.0\.1):(5436|5437)\//.test(URL_)) {
  console.error("Refusing to run: DATABASE_URL must point at localhost:5436 (dev) or :5437 (eval).");
  process.exit(1);
}
const arg = (name: string, dflt: number) =>
  Number(process.argv.find((a) => a.startsWith(`--${name}=`))?.split("=")[1] ?? dflt);
const K = arg("k", 3);
const MIN_POSITIVES = arg("min-pos", 10);
const HEAVY_POSITIVES = 30;
/** --loo: leave-ONE-out over (up to LOO_CAP most recent) positives of every eval user — one trial each. */
const LOO = process.argv.includes("--loo");
const LOO_CAP = arg("loo-cap", 60);
const N = 10;

type Row = { hit: number; recall: number; ndcg: number; novelty: number; ild: number; seen: Set<string> };
const agg = new Map<string, Row>();
const row = (k: string) => {
  let r = agg.get(k);
  if (!r) agg.set(k, (r = { hit: 0, recall: 0, ndcg: 0, novelty: 0, ild: 0, seen: new Set() }));
  return r;
};

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

/** ILD is always measured in RAW unit space so variants are comparable. */
function ild(items: ScoredCandidate[], raw: Map<string, number[]>): number {
  if (items.length < 2) return 0;
  let s = 0;
  let n = 0;
  for (let i = 0; i < items.length; i++)
    for (let j = i + 1; j < items.length; j++) {
      const a = raw.get(items[i].key);
      const b = raw.get(items[j].key);
      if (!a || !b) continue;
      s += 1 - dot(a, b);
      n++;
    }
  return n ? s / n : 0;
}

const pct = (xs: number[], ps = [0.05, 0.1, 0.25, 0.5, 0.75, 0.9, 0.95, 0.99]) => {
  const s = [...xs].sort((a, b) => a - b);
  return ps.map((p) => `p${Math.round(p * 100)}=${percentile(s, p).toFixed(3)}`).join(" ");
};

async function loadCatalog(): Promise<RecCandidate[]> {
  const ids = async (table: "movies" | "series", fk: string, floor: number) =>
    (
      await prisma.$queryRawUnsafe<Array<{ id: number }>>(
        `SELECT t.id FROM ${table} t WHERE t.embedding IS NOT NULL AND t.adult IS NOT TRUE
           AND EXISTS (SELECT 1 FROM ratings r WHERE r.${fk} = t.id
             AND r.source_id = (SELECT id FROM data_sources WHERE slug = 'tmdb') AND r.vote_count >= $1)`,
        floor
      )
    ).map((r) => r.id);
  const [m, s] = await Promise.all([
    ids("movies", "movie_id", REC_MIN_VOTES_MOVIE),
    ids("series", "series_id", REC_MIN_VOTES_SERIES),
  ]);
  const chunks = <T>(xs: T[], n: number) => Array.from({ length: Math.ceil(xs.length / n) }, (_, i) => xs.slice(i * n, i * n + n));
  const out: RecCandidate[] = [];
  for (const c of chunks(m, 2000)) out.push(...(await fetchCandidateDetails("movies", c)));
  for (const c of chunks(s, 2000)) out.push(...(await fetchCandidateDetails("series", c)));
  return out.filter((c) => c.embedding.length > 0);
}

/** Franchise (movie collection) + top-3 billed cast per catalog title, for the name-noise probe. */
async function loadNameFacets(): Promise<{ collection: Map<TitleKey, number>; leads: Map<TitleKey, Set<number>> }> {
  const col = await prisma.$queryRawUnsafe<Array<{ id: number; c: number }>>(
    `SELECT id, collection_id AS c FROM movies WHERE collection_id IS NOT NULL AND embedding IS NOT NULL`
  );
  const cast = await prisma.$queryRawUnsafe<Array<{ m: number | null; s: number | null; p: number }>>(
    `SELECT movie_id AS m, series_id AS s, person_id AS p FROM credits
     WHERE credit_type = 'CAST' AND credit_order IS NOT NULL AND credit_order < 3`
  );
  const collection = new Map(col.map((r) => [`m:${r.id}`, Number(r.c)]));
  const leads = new Map<TitleKey, Set<number>>();
  for (const r of cast) {
    const k = r.m != null ? `m:${r.m}` : `s:${r.s}`;
    const set = leads.get(k) ?? new Set<number>();
    set.add(Number(r.p));
    leads.set(k, set);
  }
  return { collection, leads };
}

interface UserData {
  id: number;
  signals: TitleSignals[];
  positives: WeightedTitle[];
  held: Set<string>;
  train: TitleSignals[];
  trainFolded: WeightedTitle[];
  rawVectors: Map<TitleKey, number[]>; // every engaged title with an embedding (not just catalog)
}

function clusterRecs(embedded: Array<{ key: string; weight: number; vector: number[] }>, vecs: Map<string, number[]>) {
  return wardClusters(embedded.filter((e) => e.weight > 0))
    .slice(0, 3)
    .map((c, index) => {
      const mean = weightedMean(c.memberKeys.map((k) => ({ vector: vecs.get(k) ?? [], weight: 1 })).filter((x) => x.vector.length));
      const vector = mean ? l2Normalize(mean) : null;
      return vector
        ? ({ index, importance: c.importance, label: "", medoid: { mediaType: "movie", id: 0, title: "", posterPath: null }, vector } satisfies RecCluster)
        : null;
    })
    .filter((c): c is RecCluster => c !== null);
}

async function main() {
  const t0 = Date.now();
  const catalogRaw = await loadCatalog();
  const rawUnit = new Map(catalogRaw.map((c) => [c.key, l2Normalize(c.embedding) ?? []]));
  const rawGenres = new Map(catalogRaw.map((c) => [c.key, c.genres]));
  const popTotal = catalogRaw.reduce((s, c) => s + Math.max(0, c.popularity ?? 0), 0) || 1;
  const stats = await readEmbeddingStats();
  const spaces: TasteSpace[] = [RAW_SPACE];
  if (stats) {
    spaces.push(makeTasteSpace({ mean: stats.mean }));
    spaces.push(makeTasteSpace({ mean: stats.mean, std: stats.std, whiten: true }));
  }
  const names = await loadNameFacets();
  console.log(
    `catalog: ${catalogRaw.length} embedded titles (vote floor ${REC_MIN_VOTES_MOVIE}/${REC_MIN_VOTES_SERIES}); μ from ${stats?.count ?? 0} titles; K=${K}, N=${N}, min positives ${MIN_POSITIVES}  (${Date.now() - t0}ms)`
  );

  // ---- users -------------------------------------------------------------
  const now = new Date();
  const userRows = await prisma.user.findMany({ select: { id: true } });
  const users: UserData[] = [];
  const allPublic: Array<{ id: number; vectors: Array<{ key: string; weight: number; vector: number[] }> }> = [];
  const allFull: Array<Array<{ key: string; weight: number; vector: number[] }>> = [];
  const bucket = { "1-2": 0, "3-4": 0, "5-9": 0, "10-29": 0, "30+": 0 };
  const positiveUsersByTitle = new Map<TitleKey, number>();
  let positiveEvents = 0;
  for (const u of userRows) {
    const signals = await fetchTasteSignals(u.id);
    if (signals.length === 0) continue;
    const full = foldSignals(signals, "full", now).titles;
    const positives = full.filter((t) => t.weight > 0);
    for (const p of positives) positiveUsersByTitle.set(p.key, (positiveUsersByTitle.get(p.key) ?? 0) + 1);
    positiveEvents += positives.length;
    const keys = full.map((t) => t.key);
    const movieIds = keys.filter((k) => k.startsWith("m:")).map((k) => Number(k.slice(2)));
    const seriesIds = keys.filter((k) => k.startsWith("s:")).map((k) => Number(k.slice(2)));
    const emb = await fetchTitleEmbeddings(movieIds, seriesIds);
    const rawVectors = new Map<TitleKey, number[]>();
    for (const [k, v] of emb) rawVectors.set(k, Array.from(v));
    const pub = foldSignals(signals, "public", now).titles;
    allPublic.push({
      id: u.id,
      vectors: pub.flatMap((t) => (rawVectors.has(t.key) ? [{ key: t.key, weight: t.weight, vector: rawVectors.get(t.key) ?? [] }] : [])),
    });
    allFull.push(full.flatMap((t) => (rawVectors.has(t.key) ? [{ key: t.key, weight: t.weight, vector: rawVectors.get(t.key) ?? [] }] : [])));
    const np = positives.length;
    if (np > 0) bucket[np < 3 ? "1-2" : np < 5 ? "3-4" : np < 10 ? "5-9" : np < 30 ? "10-29" : "30+"]++;
    if (positives.length < MIN_POSITIVES) continue;
    const posKeys = new Set(positives.map((p) => p.key));
    const ordered = signals
      .filter((s) => posKeys.has(s.key) && rawUnit.has(s.key))
      .sort((a, b) => lastSignalAt(b) - lastSignalAt(a))
      .map((s) => s.key);
    const heldSets = LOO ? ordered.slice(0, LOO_CAP).map((k) => [k]) : [ordered.slice(0, K)];
    for (const heldOut of heldSets) {
      if (heldOut.length === 0) continue;
      const held = new Set(heldOut);
      const train = signals.filter((s) => !held.has(s.key));
      users.push({ id: u.id, signals, positives, held, train, trainFolded: foldSignals(train, "full", now).titles, rawVectors });
    }
  }
  console.log(`positives per user: ${JSON.stringify(bucket)}`);
  console.log(`users with signals: ${allPublic.length}; evaluated (≥${MIN_POSITIVES} positives): ${users.length}`);

  // ---- per space --------------------------------------------------------
  const anchorCos = new Map<string, number[]>();
  const discrimination = new Map<string, { pos: number[]; rand: number[] }>();
  const probe = new Map<string, { franchise: number; lead: number; n: number }>();
  const probeKey = (k: string) => {
    let p = probe.get(k);
    if (!p) probe.set(k, (p = { franchise: 0, lead: 0, n: 0 }));
    return p;
  };

  // popular baseline (space-independent)
  for (const u of users) {
    const engaged = new Set(u.train.map((s) => s.key));
    const list = catalogRaw
      .filter((c) => !engaged.has(c.key))
      .sort((a, b) => (b.popularity ?? 0) - (a.popularity ?? 0))
      .slice(0, N);
    score("popular", list.map((c) => ({ ...c, unit: [], relRaw: 0, rel: 0, quality: 0, pop: 0, score: 0, clusterCos: [], nearestCluster: null })), u);
  }

  function score(variant: string, list: ScoredCandidate[], u: UserData) {
    const keys = list.map((c) => c.key);
    const hits = keys.filter((k) => u.held.has(k)).length;
    const a = row(variant);
    a.hit += hits > 0 ? 1 : 0;
    a.recall += hits / u.held.size;
    a.ndcg += ndcg(keys, u.held);
    a.novelty += list.reduce((s, c) => s - Math.log2(Math.max(1e-9, (c.popularity ?? 0) / popTotal)), 0) / Math.max(1, list.length);
    a.ild += ild(list, rawUnit);
    keys.forEach((k) => a.seen.add(k));
    // Name-noise probe for heavy users.
    if (u.positives.length >= HEAVY_POSITIVES) {
      const pos = u.trainFolded.filter((t) => t.weight > 0).map((t) => t.key);
      const posCollections = new Set(pos.map((k) => names.collection.get(k)).filter((x): x is number => x !== undefined));
      const posLeads = new Set(pos.flatMap((k) => [...(names.leads.get(k) ?? [])]));
      const p = probeKey(variant);
      for (const c of list) {
        p.n++;
        const col = names.collection.get(c.key);
        if (col !== undefined && posCollections.has(col)) p.franchise++;
        if ([...(names.leads.get(c.key) ?? [])].some((x) => posLeads.has(x))) p.lead++;
      }
    }
  }

  // Genre-matched popular (probe baseline): popular titles sharing a top-3 genre.
  for (const u of users.filter((x) => x.positives.length >= HEAVY_POSITIVES)) {
    const engaged = new Set(u.train.map((s) => s.key));
    const target = genreDistribution(u.trainFolded.filter((t) => t.weight > 0).map((t) => ({ genres: rawGenres.get(t.key) ?? [], weight: t.weight })));
    const top = new Set([...target.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([g]) => g));
    const list = catalogRaw
      .filter((c) => !engaged.has(c.key) && c.genres.some((g) => top.has(g)))
      .sort((a, b) => (b.popularity ?? 0) - (a.popularity ?? 0))
      .slice(0, N)
      .map((c) => ({ ...c, unit: [], relRaw: 0, rel: 0, quality: 0, pop: 0, score: 0, clusterCos: [], nearestCluster: null }));
    score("genre-popular", list, u); // probe-only baseline (not in the main table)
  }

  const userUser = new Map<string, number[]>();
  const userUserFull = new Map<string, number[]>();
  const nullPairs = new Map<string, number[]>();
  const selfSplit = new Map<string, number[]>();
  for (const space of spaces) {
    const sk = space.kind;
    const cat: RecCandidate[] = [];
    for (const c of catalogRaw) {
      const p = space.project(c.embedding);
      if (p) cat.push({ ...c, embedding: p });
    }
    const catVec = new Map(cat.map((c) => [c.key, c.embedding]));
    const genreOf = new Map(cat.map((c) => [c.key, c.genres]));
    const disc = { pos: [] as number[], rand: [] as number[] };
    discrimination.set(sk, disc);
    const anchors: number[] = [];
    anchorCos.set(sk, anchors);

    for (const u of users) {
      const vecs = new Map<string, number[]>();
      for (const [k, v] of u.rawVectors) {
        const p = space.project(v);
        if (p) vecs.set(k, p);
      }
      const embedded = u.trainFolded.flatMap((t) => (vecs.has(t.key) ? [{ key: t.key, weight: t.weight, vector: vecs.get(t.key) ?? [] }] : []));
      const { centroid, negCentroid } = rocchioCentroid(embedded);
      if (!centroid) continue;
      // user↔title discrimination: held-out positives vs random catalog titles.
      for (const h of u.held) {
        const v = catVec.get(h);
        if (v) disc.pos.push(dot(centroid, v));
      }
      for (let i = 0; i < 20; i++) disc.rand.push(dot(centroid, cat[(u.id * 7919 + i * 104729) % cat.length].embedding));

      const clusters = clusterRecs(embedded, vecs);
      const engaged = new Set(u.train.map((s) => s.key));
      const pool = cat.filter((c) => !engaged.has(c.key));
      const target = genreDistribution(u.trainFolded.filter((t) => t.weight > 0).map((t) => ({ genres: genreOf.get(t.key) ?? [], weight: t.weight })));
      const user = { clusters, centroid, negCentroid };
      // The service re-ranks only the best REC_POOL retrieved candidates.
      const withClusters = scoreCandidates(pool, user).slice(0, REC_POOL);
      const centroidOnly = scoreCandidates(pool, user, { useClusters: false }).slice(0, REC_POOL);
      const lists: Record<string, ScoredCandidate[]> = {
        centroid: centroidOnly.slice(0, N),
        clusters: withClusters.slice(0, N),
        "clusters+mmr+calib": greedySelect(withClusters, { k: N, calibrationTarget: target }),
        "centroid+mmr+calib": greedySelect(centroidOnly, { k: N, calibrationTarget: target }),
      };
      for (const [v, list] of Object.entries(lists)) score(`${sk}/${v}`, list, u);
      // Nearest-anchor cosine of the shipped list (explanation threshold).
      const anchorVecs = embedded.filter((e) => e.weight > 0).map((e) => e.vector);
      for (const c of lists["centroid+mmr+calib"]) {
        let best = -Infinity;
        for (const a of anchorVecs) best = Math.max(best, dot(c.unit, a));
        if (Number.isFinite(best)) anchors.push(best);
      }
    }

    // user↔user PUBLIC centroid distribution + split-half self-similarity.
    const cents: number[][] = [];
    const self: number[] = [];
    for (const p of allPublic) {
      const items = p.vectors.flatMap((x) => {
        const v = space.project(x.vector);
        return v ? [{ key: x.key, weight: x.weight, vector: v }] : [];
      });
      const c = rocchioCentroid(items).centroid;
      if (c) cents.push(c);
      const pos = items.filter((x) => x.weight > 0).sort((a, b) => a.key.localeCompare(b.key));
      if (pos.length >= 2 * MIN_POSITIVES) {
        const a = rocchioCentroid(pos.filter((_, i) => i % 2 === 0)).centroid;
        const b = rocchioCentroid(pos.filter((_, i) => i % 2 === 1)).centroid;
        if (a && b) self.push(dot(a, b));
      }
    }
    const pairs: number[] = [];
    for (let i = 0; i < cents.length; i++) for (let j = i + 1; j < cents.length; j++) pairs.push(dot(cents[i], cents[j]));
    userUser.set(sk, pairs);
    // Null model: centroids of two RANDOM catalog title sets of size m (unrelated "users").
    for (const m of [10, 30]) {
      const xs: number[] = [];
      let seed = 12345 + m;
      const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
      const set = () => rocchioCentroid(Array.from({ length: m }, () => ({ weight: 1, vector: cat[Math.floor(rnd() * cat.length)].embedding }))).centroid;
      for (let i = 0; i < 400; i++) {
        const a = set();
        const b = set();
        if (a && b) xs.push(dot(a, b));
      }
      nullPairs.set(`${sk} m=${m}`, xs);
    }
    const fc = allFull
      .map((items) => rocchioCentroid(items.flatMap((x) => { const v = space.project(x.vector); return v ? [{ ...x, vector: v }] : []; })).centroid)
      .filter((c): c is number[] => c !== null);
    const fp: number[] = [];
    for (let i = 0; i < fc.length; i++) for (let j = i + 1; j < fc.length; j++) fp.push(dot(fc[i], fc[j]));
    userUserFull.set(sk, fp);
    selfSplit.set(sk, self);
    console.log(`space ${sk}: ${cents.length} public centroids, ${pairs.length} pairs  (${Date.now() - t0}ms)`);
  }

  // ---- report -----------------------------------------------------------
  const n = users.length;
  console.log(`\n${LOO ? "leave-one-out trials" : "users"} evaluated: ${n} (from ${new Set(users.map((u) => u.id)).size} users)`);
  console.log("variant                         hit@10  recall@10  nDCG@10  coverage  novelty  ILD(raw)");
  for (const [v, a] of agg) {
    if (v === "genre-popular") continue;
    const f = (x: number) => (x / n).toFixed(3);
    console.log(
      `${v.padEnd(32)}${f(a.hit).padStart(6)}  ${f(a.recall).padStart(9)}  ${f(a.ndcg).padStart(7)}  ${(a.seen.size / catalogRaw.length).toFixed(3).padStart(8)}  ${f(a.novelty).padStart(7)}  ${f(a.ild)}`
    );
  }
  console.log("\nuser↔user PUBLIC centroid cosine (all pairs):");
  for (const [k, xs] of userUser) console.log(`  ${k.padEnd(9)} n=${xs.length} ${pct(xs)}`);
  console.log("user↔user FULL-scope centroid cosine (all users with a centroid; same geometry, more pairs):");
  for (const [k, xs] of userUserFull) console.log(`  ${k.padEnd(9)} n=${xs.length} ${pct(xs)}`);
  console.log("null model — two random catalog title sets of size m:");
  for (const [k, xs] of nullPairs) console.log(`  ${k.padEnd(14)} ${pct(xs, [0.05, 0.5, 0.95, 0.99])}`);
  console.log(`split-half self-similarity (users with ≥${2 * MIN_POSITIVES} public positives):`);
  for (const [k, xs] of selfSplit) console.log(`  ${k.padEnd(9)} n=${xs.length} ${pct(xs, [0.1, 0.25, 0.5, 0.75, 0.9])}`);
  console.log("user→title cosine: held-out positives vs random catalog titles (AUC):");
  for (const [k, d] of discrimination) {
    let wins = 0;
    for (const p of d.pos) for (const r of d.rand) wins += p > r ? 1 : p === r ? 0.5 : 0;
    const auc = wins / Math.max(1, d.pos.length * d.rand.length);
    console.log(`  ${k.padEnd(9)} AUC=${auc.toFixed(3)}  pos ${pct(d.pos, [0.1, 0.5, 0.9])}  rand ${pct(d.rand, [0.1, 0.5, 0.9])}`);
  }
  console.log("nearest-anchor cosine of recommended items (explanation threshold):");
  for (const [k, xs] of anchorCos) console.log(`  ${k.padEnd(9)} ${pct(xs, [0.1, 0.25, 0.5, 0.75, 0.9])}`);
  console.log(`\nname-noise probe (users with ≥${HEAVY_POSITIVES} positives; share of top-10 sharing a franchise / a top-3-billed lead with a train positive):`);
  for (const [k, p] of probe) console.log(`  ${k.padEnd(32)} franchise=${(p.franchise / Math.max(1, p.n)).toFixed(3)} lead=${(p.lead / Math.max(1, p.n)).toFixed(3)} (n=${p.n})`);
  const titles5 = [...positiveUsersByTitle.values()].filter((c) => c >= 5).length;
  const titles2 = [...positiveUsersByTitle.values()].filter((c) => c >= 2).length;
  console.log(
    `\nco-occurrence: ${positiveEvents} positive (user,title) pairs over ${positiveUsersByTitle.size} titles; titles with ≥2 positive users: ${titles2}, ≥5: ${titles5}`
  );
  console.log(`total ${Date.now() - t0}ms`);
}

main()
  .catch((e: unknown) => {
    console.error(e instanceof Error ? e.stack ?? e.message : String(e));
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
