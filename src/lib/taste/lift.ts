/**
 * Facet lift with Bayesian shrinkage (spec §6) and the "Your people" ranking.
 *
 * shrink(v, R, m, C) = v/(v+m)·R + m/(v+m)·C — the IMDb weighted-rating
 * formula: with little support (small v) a value is pulled toward the prior C.
 *   - facets:  R = ln(userShare / baselineShare), C = 0 ("no lift"), m = FACET_PRIOR_M
 *   - people:  R = mean user score on their titles, C = user mean score, m = PEOPLE_PRIOR_M
 */
import {
  FACET_MIN_SUPPORT,
  FACET_PRIOR_M,
  FACET_SUPPORT_TITLES,
  FACET_TOP_K,
  PEOPLE_PRIOR_M,
  PEOPLE_TOP_K,
} from "./constants";
import type { FacetBaseline, FacetType, FacetValue, PersonInfo, TitleRef } from "./types";

export function shrink(v: number, r: number, m: number, c: number): number {
  if (v + m <= 0) return c;
  return (v / (v + m)) * r + (m / (v + m)) * c;
}

export interface LiftInput {
  key: string;
  ref: TitleRef;
  weight: number;
  facets: readonly FacetValue[];
}

export interface FacetStat {
  type: FacetType;
  key: string;
  label: string;
  /** Support: positive titles carrying the value. */
  count: number;
  /** e^R — raw (unshrunk) multiple of the baseline share, 2 decimals. */
  lift: number;
  /** Shrunk log-lift (ranking key), 4 decimals. */
  score: number;
  /** Highest-weight supporting titles (evidence for the UI). */
  titles: TitleRef[];
}

/**
 * Rank the values of ONE facet type across positive titles. Only titles that
 * carry at least one value of the type enter the denominator, so missing
 * metadata (e.g. no AI tags yet) never dilutes a share.
 */
export function liftFacets(
  type: FacetType,
  items: readonly LiftInput[],
  baseline: FacetBaseline,
  opts: { m?: number; minSupport?: number; k?: number; supportTitles?: number } = {}
): FacetStat[] {
  const m = opts.m ?? FACET_PRIOR_M;
  const minSupport = opts.minSupport ?? FACET_MIN_SUPPORT;
  const k = opts.k ?? FACET_TOP_K;
  const supportTitles = opts.supportTitles ?? FACET_SUPPORT_TITLES;

  let totalMass = 0;
  const byKey = new Map<string, { label: string; mass: number; members: LiftInput[] }>();
  for (const it of items) {
    if (!(it.weight > 0)) continue;
    const values = it.facets.filter((f) => f.type === type);
    if (values.length === 0) continue;
    totalMass += it.weight;
    const seen = new Set<string>();
    for (const f of values) {
      if (seen.has(f.key)) continue;
      seen.add(f.key);
      const entry = byKey.get(f.key);
      if (entry) {
        entry.mass += it.weight;
        entry.members.push(it);
      } else {
        byKey.set(f.key, { label: f.label, mass: it.weight, members: [it] });
      }
    }
  }
  if (totalMass === 0) return [];

  const size = Math.max(0, baseline.size(type));
  const out: FacetStat[] = [];
  for (const [key, entry] of byKey) {
    const v = entry.members.length;
    if (v < minSupport) continue;
    const userShare = entry.mass / totalMass;
    const baseShare = (Math.max(0, baseline.count(type, key)) + 1) / (size + 1);
    const r = Math.log(userShare / baseShare);
    const score = shrink(v, r, m, 0);
    if (!(score > 0)) continue;
    out.push({
      type,
      key,
      label: entry.label,
      count: v,
      lift: Math.round(Math.exp(r) * 100) / 100,
      score: Math.round(score * 1e4) / 1e4,
      titles: [...entry.members]
        .sort((a, b) => b.weight - a.weight || a.key.localeCompare(b.key))
        .slice(0, supportTitles)
        .map((x) => x.ref),
    });
  }
  return out
    .sort((a, b) => b.score - a.score || b.count - a.count || a.label.localeCompare(b.label))
    .slice(0, k);
}

export interface PeopleInput {
  key: string;
  weight: number;
  watched: boolean;
  score: number | null;
  /** director/cast facet values of the title (key = person tmdbId as string). */
  facets: readonly FacetValue[];
}

export interface PersonStat {
  tmdbId: number;
  name: string;
  profilePath: string | null;
  role: "director" | "cast";
  /** Distinct titles seen (watched or rated) featuring the person. */
  count: number;
  /** Raw mean 1-10 score over the person's scored titles (null when none). */
  avgScore: number | null;
  /** Shrunk mean toward the user's mean (ranking key for "highest rated"). */
  shrunkScore: number | null;
  ratedCount: number;
}

export function rankPeople(
  items: readonly PeopleInput[],
  people: ReadonlyMap<string, PersonInfo>,
  userMean: number,
  opts: { m?: number; minSupport?: number; k?: number } = {}
): { mostWatched: PersonStat[]; highestRated: PersonStat[] } {
  const m = opts.m ?? PEOPLE_PRIOR_M;
  const minSupport = opts.minSupport ?? FACET_MIN_SUPPORT;
  const k = opts.k ?? PEOPLE_TOP_K;

  const acc = new Map<
    string,
    { role: "director" | "cast"; seen: number; mass: number; scores: number[] }
  >();
  for (const it of items) {
    const seenTitle = it.watched || it.score !== null;
    if (!seenTitle) continue;
    const seen = new Set<string>();
    for (const f of it.facets) {
      if (f.type !== "director" && f.type !== "cast") continue;
      const id = `${f.type}:${f.key}`;
      if (seen.has(id)) continue;
      seen.add(id);
      const e = acc.get(id) ?? { role: f.type, seen: 0, mass: 0, scores: [] };
      e.seen += 1;
      e.mass += Math.max(0, it.weight);
      if (it.score !== null) e.scores.push(it.score);
      acc.set(id, e);
    }
  }

  const stats: (PersonStat & { mass: number })[] = [];
  for (const [id, e] of acc) {
    const personKey = id.slice(id.indexOf(":") + 1);
    const info = people.get(personKey);
    if (!info) continue;
    const ratedCount = e.scores.length;
    const avg = ratedCount > 0 ? e.scores.reduce((a, b) => a + b, 0) / ratedCount : null;
    stats.push({
      tmdbId: info.tmdbId,
      name: info.name,
      profilePath: info.profilePath,
      role: e.role,
      count: e.seen,
      avgScore: avg === null ? null : Math.round(avg * 10) / 10,
      shrunkScore: avg === null ? null : Math.round(shrink(ratedCount, avg, m, userMean) * 100) / 100,
      ratedCount,
      mass: e.mass,
    });
  }

  const strip = ({ mass: _mass, ...rest }: PersonStat & { mass: number }): PersonStat => rest;
  const mostWatched = stats
    .filter((s) => s.count >= minSupport)
    .sort((a, b) => b.count - a.count || b.mass - a.mass || a.name.localeCompare(b.name))
    .slice(0, k)
    .map(strip);
  const highestRated = stats
    .filter((s) => s.ratedCount >= minSupport && s.shrunkScore !== null)
    .sort(
      (a, b) =>
        (b.shrunkScore ?? 0) - (a.shrunkScore ?? 0) ||
        b.ratedCount - a.ratedCount ||
        a.name.localeCompare(b.name)
    )
    .slice(0, k)
    .map(strip);
  return { mostWatched, highestRated };
}
