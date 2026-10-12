"use server";

/**
 * Viewer-scoped taste actions (POST — never edge-cached). The home page and
 * /u/* are ISR; these feed client islands only. Specs
 * docs/superpowers/specs/2026-10-09-taste-recommendations-design.md and
 * 2026-10-12-taste-experience-v2-design.md §6.3.
 */
import { z } from "zod";
import { REC_ALGO_VERSION } from "@/lib/taste/recommend-constants";
import type {
  GetHomeRecsInput,
  HomeRecsDTO,
  RecRowDTO,
  RecSeedInput,
  TasteMatchDTO,
  TasteTwinDTO,
} from "@/lib/taste/recommend-types";
import { getHomeRecsForUser, getMoreLikeThisForUser } from "@/server/services/taste/recommend";
import { getTasteMatchFor, getTasteTwinsFor } from "@/server/services/taste/match";
import { viewerId } from "@/server/services/taste/viewer";

const TuneValue = z.string().regex(/^[a-z0-9][a-z0-9_-]{0,39}$/);

const TuneSchema = z
  .object({
    media: z.enum(["movie", "series"]).optional(),
    maxRuntime: z.literal(100).optional(),
    tone: z.enum(["light", "dark"]).optional(),
    era: z.enum(["classic", "recent"]).optional(),
    genres: z.array(TuneValue).max(8).optional(),
    languages: z.array(TuneValue).max(8).optional(),
    moods: z.array(TuneValue).max(8).optional(),
    shuffle: z.number().int().nonnegative().max(2 ** 31).optional(),
  })
  .strict();

const HomeRecsInputSchema = z
  .object({
    tune: TuneSchema.optional(),
    shuffle: z.number().int().nonnegative().max(2 ** 31).optional(),
    exclude: z
      .array(z.string().regex(/^[ms]:\d{1,9}$/))
      .max(40)
      .optional(),
  })
  .strict();

function emptyHome(): HomeRecsDTO {
  return { rows: [], reason: "error", algo: REC_ALGO_VERSION, tuneAvailable: {}, tuneChips: [], positiveCount: 0 };
}

/**
 * Home "For you" (+ Tune bar metadata) + "Because you loved …" rows. Guests
 * → no rows. `tune` / `shuffle` re-rank the cached pool (no new ANN).
 */
export async function getHomeRecs(input: GetHomeRecsInput = {}): Promise<HomeRecsDTO> {
  const parsed = HomeRecsInputSchema.safeParse(input);
  if (!parsed.success) return emptyHome();
  const uid = await viewerId();
  if (!uid) return emptyHome();
  const { tune, shuffle, exclude } = parsed.data;
  return getHomeRecsForUser(uid, tune, { shuffle, exclude });
}

const SeedSchema = z.object({ mediaType: z.enum(["movie", "series"]), id: z.number().int().positive() }).strict();

/** "More like {seed}" row for the signed-in viewer (null = nothing to show). */
export async function getMoreLikeThis(seed: RecSeedInput): Promise<RecRowDTO | null> {
  const parsed = SeedSchema.safeParse(seed);
  if (!parsed.success) return null;
  const uid = await viewerId();
  if (!uid) return null;
  return getMoreLikeThisForUser(uid, parsed.data);
}

const UsernameSchema = z.string().trim().min(1).max(40).regex(/^[A-Za-z0-9_.-]+$/);

/** Taste match between the signed-in viewer and a profile owner (null = hidden). */
export async function getTasteMatch(username: string): Promise<TasteMatchDTO | null> {
  const parsed = UsernameSchema.safeParse(username);
  if (!parsed.success) return null;
  const uid = await viewerId();
  if (!uid) return null;
  return getTasteMatchFor(uid, parsed.data);
}

/** "Taste twins" follow suggestions for the signed-in viewer. */
export async function getTasteTwins(): Promise<TasteTwinDTO[]> {
  const uid = await viewerId();
  if (!uid) return [];
  return getTasteTwinsFor(uid);
}
