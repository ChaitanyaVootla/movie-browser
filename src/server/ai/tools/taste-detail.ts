/**
 * get_taste_detail — the signed-in user's FULL taste profile in detail (their
 * own chat): clusters with member titles, lifted facets with evidence titles,
 * axes with captions, people. Extends the compact `get_user_profile.taste`
 * summary. Deterministic stored-row reads, no LLM. Numbers + titles only — the
 * agent talks about the titles, never labels the person (Fable rule).
 */
import { tool } from "@langchain/core/tools";
import { z } from "zod";
import type { RunnableConfig } from "@langchain/core/runnables";
import type { TasteCluster, TasteSnapshot } from "@/lib/taste/profile";
import type { FacetStat } from "@/lib/taste/lift";
import { FACET_TYPES, type TasteMediaType } from "@/lib/taste/types";
import { getTasteClusters, getTasteProfile } from "@/server/services/taste";
import { fetchTitleRefs } from "@/server/db/postgres/social/taste-recs";
import { isAdultKeyword } from "@/server/db/postgres/social/taste";
import { aiToolLogger } from "@/lib/logger";
import { getUserIdFromConfig } from "../utils";

export const GetTasteDetailSchema = z.object({
  part: z
    .enum(["clusters", "facets", "axes", "people", "all"])
    .default("all")
    .describe('Which part: "clusters" | "facets" | "axes" | "people" | "all" (default)'),
  clusterIndex: z
    .number()
    .int()
    .min(0)
    .max(20)
    .optional()
    .describe("Only this cluster (0 = the biggest, as listed in a previous call)"),
});

const MAX_MEMBERS = 12;
const MAX_FACET_TITLES = 6;
const MAX_FACETS_PER_TYPE = 6;
const MAX_PEOPLE = 5;
const round2 = (x: number) => Math.round(x * 100) / 100;

interface MemberRef {
  id: number;
  mediaType: TasteMediaType;
  title: string;
  year: number | null;
}

function parseKey(key: string): { mediaType: TasteMediaType; id: number } | null {
  const id = Number(key.slice(2));
  if (!Number.isInteger(id)) return null;
  if (key.startsWith("m:")) return { mediaType: "movie", id };
  if (key.startsWith("s:")) return { mediaType: "series", id };
  return null;
}

function facetView(f: FacetStat) {
  return {
    label: f.label,
    count: f.count,
    lift: round2(f.lift),
    titles: f.titles.slice(0, MAX_FACET_TITLES).map((t) => t.title),
  };
}

const cleanFacets = (xs: readonly FacetStat[]) =>
  xs.filter((f) => !isAdultKeyword(f.label)).slice(0, MAX_FACETS_PER_TYPE).map(facetView);

async function clusterViews(clusters: readonly TasteCluster[], only: number | undefined) {
  const ordered = [...clusters]
    .sort((a, b) => b.importance - a.importance)
    .map((c, index) => ({ c, index }));
  const picked = only === undefined ? ordered : ordered.filter((x) => x.index === only);
  const memberKeys = picked.flatMap(({ c }) => c.memberKeys.slice(0, MAX_MEMBERS * 2));
  const movieIds: number[] = [];
  const seriesIds: number[] = [];
  for (const k of memberKeys) {
    const p = parseKey(k);
    if (p) (p.mediaType === "movie" ? movieIds : seriesIds).push(p.id);
  }
  const refs = memberKeys.length ? await fetchTitleRefs(movieIds, seriesIds) : new Map();
  const views = picked.map(({ c, index }) => {
    const members: MemberRef[] = [];
    for (const k of c.memberKeys) {
      if (members.length >= MAX_MEMBERS) break;
      const p = parseKey(k);
      const r = refs.get(k);
      if (!p || !r) continue; // adult / missing titles are never listed
      const year = r.releaseDate ? Number(r.releaseDate.slice(0, 4)) : null;
      members.push({ id: p.id, mediaType: p.mediaType, title: r.title, year: Number.isFinite(year) ? year : null });
    }
    return {
      index,
      label: isAdultKeyword(c.label) ? `Cluster ${index + 1}` : c.label,
      share: round2(c.importance),
      size: c.size,
      members,
    };
  });
  const all = ordered.map(({ c, index }) => ({ index, label: isAdultKeyword(c.label) ? `Cluster ${index + 1}` : c.label, share: round2(c.importance) }));
  const thinnest = all.length ? all.reduce((a, b) => (b.share < a.share ? b : a)) : null;
  return { views, thinnest };
}

function facetsPart(snapshot: TasteSnapshot) {
  const out: Record<string, ReturnType<typeof facetView>[]> = {};
  for (const type of FACET_TYPES) {
    const list = cleanFacets(snapshot.facets[type] ?? []);
    if (list.length) out[type] = list;
  }
  return out;
}

function personView(p: TasteSnapshot["people"]["mostWatched"][number]) {
  return {
    name: p.name,
    role: p.role,
    count: p.count,
    avgScore: p.avgScore === null ? null : round2(p.avgScore),
    ratedCount: p.ratedCount,
  };
}

export async function getTasteDetailHandler(
  input: z.infer<typeof GetTasteDetailSchema>,
  config?: RunnableConfig
): Promise<string> {
  const userId = getUserIdFromConfig(config);
  if (!userId) {
    return JSON.stringify({
      error: "Not logged in",
      hint: "Taste details need an account. Ask what they loved recently instead.",
    });
  }
  try {
    const [snapshot, clusters] = await Promise.all([
      getTasteProfile(userId, { scope: "full" }),
      getTasteClusters(userId),
    ]);
    if (!snapshot || snapshot.positiveCount === 0) {
      return JSON.stringify({
        error: "no_profile",
        hint: "No taste profile yet. Suggest rating or hearting a handful of favourites, then ask again.",
      });
    }
    const part = input.part;
    const want = (p: typeof part) => part === "all" || part === p;
    const out: Record<string, unknown> = { basedOnTitles: snapshot.positiveCount };

    if (want("clusters")) {
      const { views, thinnest } = await clusterViews(clusters, input.clusterIndex);
      out.clusters = views;
      out.thinnestCluster = thinnest;
    }
    if (want("facets")) {
      out.facets = facetsPart(snapshot);
      out.moods = cleanFacets(snapshot.moods);
    }
    if (want("axes")) {
      out.axes = snapshot.axes.map((a) => ({
        axis: a.key,
        value: round2(a.value),
        low: a.lowLabel,
        high: a.highLabel,
        caption: a.caption,
        support: a.support,
      }));
    }
    if (want("people")) {
      out.people = {
        mostWatched: snapshot.people.mostWatched.slice(0, MAX_PEOPLE).map(personView),
        highestRated: snapshot.people.highestRated.slice(0, MAX_PEOPLE).map(personView),
      };
    }
    out.note =
      "Their own data (includes private watches — fine in their chat). Talk about the titles and numbers; never label the person. share = fraction of the profile; lift = how much more often than the catalog.";
    return JSON.stringify(out);
  } catch (error: unknown) {
    aiToolLogger.error({
      event: "tool_error",
      tool: "get_taste_detail",
      error: error instanceof Error ? error.message : String(error),
    });
    return JSON.stringify({ error: "Failed to load taste details" });
  }
}

export const getTasteDetailTool = tool(getTasteDetailHandler, {
  name: "get_taste_detail",
  description: `The signed-in user's taste profile in detail: taste clusters (share of the profile + up to 12 member titles each, thinnestCluster = the smallest), lifted genres/keywords/themes/moods/directors/cast/countries/languages/decades (count, lift, example titles), axes (Mainstream↔Niche, Classic↔New, Focused↔Eclectic, Generous↔Tough, Light↔Heavy: value 0-1, endpoint labels, number caption), and the people they watch most / rate highest.

Use when: they ask about their own taste ("what's my taste like?", "which part of my profile is thinnest?", "what do my sci-fi favourites have in common?", "why does my profile say Niche?"). Follow with recommend_for_me / steer_recs if they then want picks to fill a gap.
Don't use when: the user is a guest (returns an error); they just want picks (recommend_for_me); a quick summary is enough (get_user_profile already carries one).

Params: part (default "all"), clusterIndex to drill into one cluster.`,
  schema: GetTasteDetailSchema,
});
