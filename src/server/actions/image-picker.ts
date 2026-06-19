"use server";

import { z } from "zod";
import { dataLogger } from "@/lib/logger";
import {
  searchMulti,
  getMovieImages,
  getSeriesImages,
  getPersonImages,
  getEpisodeImages,
  type TmdbImageItem,
} from "@/server/services/tmdb";
import type {
  ImageKind,
  PickerEntityResult,
  PickerImage,
  PickerImageGroups,
} from "@/types/image-picker";

/**
 * Canonical image-picker data layer (used by `MediaImagePicker` everywhere:
 * comment/review composers + profile backdrop/avatar). TMDB-LIVE on purpose —
 * the local `images` catalog table is sparse, and TMDB URLs are canonical, so
 * the picker can offer ALL artwork for ANY title/person regardless of whether
 * the item is hydrated locally. Cached by the TMDB client (1h images TTL).
 */

const SEARCH_LIMIT = 18;

/**
 * Search movies, series AND people in one call (TMDB /search/multi). Unlike the
 * profile's old `searchTitlesForBackdrop` (titles only) this also returns people,
 * so an actor/director profile photo can be picked.
 */
export async function searchImageEntities(query: string): Promise<PickerEntityResult[]> {
  const q = z.string().trim().min(1).max(100).parse(query);
  try {
    const res = await searchMulti(q);
    const results = (res.results ?? []) as Array<Record<string, unknown>>;
    return results
      .filter(
        (r) => r.media_type === "movie" || r.media_type === "tv" || r.media_type === "person"
      )
      .slice(0, SEARCH_LIMIT)
      .map((r): PickerEntityResult => {
        if (r.media_type === "person") {
          return {
            entityType: "person",
            tmdbId: r.id as number,
            name: (r.name as string) ?? "",
            subtitle: (r.known_for_department as string | undefined) ?? "Person",
            imagePath: (r.profile_path as string | null) ?? null,
          };
        }
        const isMovie = r.media_type === "movie";
        const date = (isMovie ? r.release_date : r.first_air_date) as string | undefined;
        return {
          entityType: isMovie ? "movie" : "series",
          tmdbId: r.id as number,
          name: ((isMovie ? r.title : r.name) as string) ?? "",
          subtitle: date ? date.slice(0, 4) : null,
          imagePath: (r.poster_path as string | null) ?? null,
        };
      })
      .filter((r) => r.tmdbId && r.name);
  } catch (error: unknown) {
    dataLogger.error({
      action: "searchImageEntities",
      error: error instanceof Error ? error.message : String(error),
    });
    return [];
  }
}

const GetImagesSchema = z.object({
  entityType: z.enum(["movie", "series", "person", "episode"]),
  tmdbId: z.number().int().positive(),
  seasonNumber: z.number().int().min(0).optional(),
  episodeNumber: z.number().int().min(1).optional(),
});

const DEFAULT_RATIO: Record<ImageKind, number> = {
  backdrop: 1.778,
  still: 1.778,
  logo: 1.778,
  poster: 0.667,
  profile: 0.667,
};

/** Map raw TMDB image entries → sorted (best-first) PickerImage[]. */
function mapImages(items: TmdbImageItem[] | undefined, kind: ImageKind): PickerImage[] {
  return (items ?? [])
    .filter((i) => Boolean(i.file_path))
    .map((i) => ({
      filePath: i.file_path,
      kind,
      aspectRatio: i.aspect_ratio || DEFAULT_RATIO[kind],
      voteAverage: i.vote_average ?? 0,
      lang: i.iso_639_1 ?? null,
    }))
    .sort((a, b) => b.voteAverage - a.voteAverage);
}

const EMPTY: PickerImageGroups = {
  backdrops: [],
  posters: [],
  logos: [],
  profiles: [],
  stills: [],
};

/**
 * ALL images for an entity, grouped by kind. No top-k cap — TMDB returns the
 * full set and the picker scrolls. Person → profiles; episode → its stills
 * (falls back to the parent series artwork when an episode has no stills);
 * movie/series → backdrops + posters + logos across every language.
 */
export async function getPickerImages(
  raw: z.infer<typeof GetImagesSchema>
): Promise<PickerImageGroups> {
  try {
    const input = GetImagesSchema.parse(raw);

    if (input.entityType === "person") {
      const r = await getPersonImages(input.tmdbId);
      return { ...EMPTY, profiles: mapImages(r.profiles, "profile") };
    }

    if (input.entityType === "episode") {
      if (input.seasonNumber != null && input.episodeNumber != null) {
        try {
          const r = await getEpisodeImages(input.tmdbId, input.seasonNumber, input.episodeNumber);
          const stills = mapImages(r.stills, "still");
          if (stills.length > 0) return { ...EMPTY, stills };
        } catch {
          /* fall through to the parent series artwork */
        }
      }
      const s = await getSeriesImages(input.tmdbId, { allLanguages: true });
      return {
        ...EMPTY,
        backdrops: mapImages(s.backdrops, "backdrop"),
        posters: mapImages(s.posters, "poster"),
        logos: mapImages(s.logos, "logo"),
      };
    }

    const r =
      input.entityType === "movie"
        ? await getMovieImages(input.tmdbId, { allLanguages: true })
        : await getSeriesImages(input.tmdbId, { allLanguages: true });
    return {
      ...EMPTY,
      backdrops: mapImages(r.backdrops, "backdrop"),
      posters: mapImages(r.posters, "poster"),
      logos: mapImages(r.logos, "logo"),
    };
  } catch (error: unknown) {
    dataLogger.error({
      action: "getPickerImages",
      error: error instanceof Error ? error.message : String(error),
    });
    return EMPTY;
  }
}
