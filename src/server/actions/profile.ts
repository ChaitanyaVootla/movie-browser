"use server";

import { z } from "zod";
import { Prisma } from "@prisma/client";
import { getMovieImages, getSeriesImages, searchMulti } from "@/server/services/tmdb";
import { requirePgUserId } from "@/lib/user-id";
import { userApiLogger } from "@/lib/logger";
import { prisma } from "@/server/db/postgres";
import { auditedTransaction } from "@/server/db/audit";
import { isPrismaError } from "@/server/services/hydration/sources/postgres/error-utils";

const RESERVED = new Set(["admin", "api", "settings", "import", "export", "me", "u"]);

const ClaimUsernameSchema = z.object({
  username: z
    .string()
    .regex(/^[a-zA-Z0-9_]{3,20}$/, "3-20 characters: letters, numbers, underscore"),
});

export async function claimUsername(input: z.infer<typeof ClaimUsernameSchema>) {
  try {
    const { username } = ClaimUsernameSchema.parse(input);
    if (RESERVED.has(username.toLowerCase())) {
      return { success: false as const, error: "Username not available" };
    }
    const userId = await requirePgUserId();
    // Run inside auditedTransaction so the username change records BOTH the
    // typed username_history row AND a generic audit_log row attributed to this
    // user (the users-table UPDATE trigger fires with audit.actor_id = userId).
    await auditedTransaction(userId, async (tx) => {
      // Read the CURRENT handle before overwriting it.
      const current = await tx.user.findUnique({
        where: { id: userId },
        select: { username: true },
      });
      await tx.user.update({ where: { id: userId }, data: { username } });
      // History semantics: we record the handle a user LEAVES BEHIND. The
      // first-ever claim (previous === null) records NO row — the trail is the
      // sequence of prior handles, and there is no prior handle on first claim.
      // A no-op "change" to the same string also records nothing.
      const previous = current?.username ?? null;
      if (previous && previous !== username) {
        await tx.usernameHistory.create({ data: { userId, username: previous } });
      }
    });
    return { success: true as const, username };
  } catch (error: unknown) {
    // P2002 covers both the Prisma @unique and the raw lower(username) unique
    // (PG 23505 maps to P2002).
    if (isPrismaError(error) && error.code === "P2002") {
      return { success: false as const, error: "Username already taken" };
    }
    const message = error instanceof Error ? error.message : String(error);
    userApiLogger.error({ action: "claimUsername", error: message });
    return { success: false as const, error: message };
  }
}

export async function getMyProfile() {
  try {
    const userId = await requirePgUserId();
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        username: true,
        name: true,
        image: true,
        bio: true,
        isPublic: true,
        metadata: true,
      },
    });
    return { success: true as const, user };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    userApiLogger.error({ action: "getMyProfile", error: message });
    return { success: false as const, error: message };
  }
}

// ---------------------------------------------------------------------------
// UI contract bridge (Appendix A) — Task 24
// ---------------------------------------------------------------------------

import { revalidatePath } from "next/cache";
import { getPublicProfileByUsername, parseEnvelope } from "@/server/db/postgres/social/public-profile";
import { getFourFavorites, setFourFavorites } from "@/server/db/postgres/social/lists";
import { followUser, unfollowUser, isFollowing } from "@/server/db/postgres/social/follows";
import { assertNotBlocked } from "@/server/db/postgres/social/blocks";
import { auth } from "@/lib/auth";
import type {
  ActionResult,
  FavoriteItemDTO,
  OwnProfileSettingsDTO,
  ProfileCustomizationInput,
  ProfileViewerStateDTO,
  PublicProfileDTO,
  TrackedMediaType,
} from "@/types/social";

export async function getPublicProfile(username: string): Promise<PublicProfileDTO | null> {
  return getPublicProfileByUsername(z.string().min(1).max(30).parse(username));
}

/**
 * Fresh, UNCACHED full profile for the authenticated OWNER only. `/u/[username]`
 * is ISR + CDN-cached (anonymous), so an owner's own edits (backdrop, accent,
 * bio, location, layout, four-favorites…) lag up to the cache TTL — confusing
 * when you can't see your own changes. The profile body re-fetches this once it
 * resolves the viewer as the owner and re-renders from fresh data; everyone else
 * rides the cached page. Returns null for non-owners (server-action POST → never
 * edge-cached, always request-time fresh).
 */
export async function getFreshProfileForOwner(username: string): Promise<PublicProfileDTO | null> {
  try {
    const parsed = z.string().min(1).max(30).parse(username);
    const session = await auth();
    if (!session?.user) return null;
    const viewerId = await requirePgUserId();
    const target = await prisma.user.findFirst({
      where: { username: { equals: parsed, mode: "insensitive" } },
      select: { id: true },
    });
    if (!target || target.id !== viewerId) return null;
    return getPublicProfileByUsername(parsed);
  } catch {
    return null;
  }
}

export async function getProfileViewerState(username: string): Promise<ProfileViewerStateDTO> {
  const fallback = { isOwner: false, isFollowing: false };
  try {
    const session = await auth();
    if (!session?.user) return fallback;
    const viewerId = await requirePgUserId();
    const target = await prisma.user.findFirst({
      where: { username: { equals: username, mode: "insensitive" } },
      select: { id: true },
    });
    if (!target) return fallback;
    if (target.id === viewerId) return { isOwner: true, isFollowing: false };
    return { isOwner: false, isFollowing: await isFollowing(viewerId, target.id) };
  } catch {
    return fallback;
  }
}

export async function followAction(input: {
  username: string;
  follow: boolean;
}): Promise<ActionResult> {
  try {
    const viewerId = await requirePgUserId();
    const target = await prisma.user.findFirst({
      where: { username: { equals: input.username, mode: "insensitive" } },
      select: { id: true },
    });
    if (!target || target.id === viewerId) return { ok: false, error: "Not found" };
    const targetId = target.id;
    // Wrap the follows write in auditedTransaction for actor attribution
    // (matches social.ts follow/unfollow).
    if (input.follow) {
      await assertNotBlocked(viewerId, targetId);
      await auditedTransaction(viewerId, (tx) => followUser(viewerId, targetId, tx));
    } else {
      await auditedTransaction(viewerId, (tx) => unfollowUser(viewerId, targetId, tx));
    }
    return { ok: true };
  } catch (error: unknown) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export async function claimUsernameAction(input: { username: string }): Promise<ActionResult> {
  const result = await claimUsername(input);
  if (result.success) {
    revalidatePath(`/u/${result.username}`);
    return { ok: true };
  }
  return { ok: false, error: result.error };
}

export async function checkUsernameAvailability(
  username: string
): Promise<{ available: boolean }> {
  const candidate = username.toLowerCase();
  if (!/^[a-z0-9_]{3,20}$/.test(candidate) || RESERVED.has(candidate)) {
    return { available: false };
  }
  const existing = await prisma.user.findFirst({
    where: { username: { equals: candidate, mode: "insensitive" } },
    select: { id: true },
  });
  return { available: existing === null };
}

export async function getUsernameStatus(): Promise<{ username: string | null }> {
  try {
    const userId = await requirePgUserId();
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { username: true },
    });
    return { username: user?.username ?? null };
  } catch {
    return { username: null };
  }
}

// Prior handles this user has left behind, newest-first. Empty until they
// change their username at least once (the first claim records no history).
export async function getUsernameHistory(userId: number): Promise<string[]> {
  try {
    const rows = await prisma.usernameHistory.findMany({
      where: { userId },
      orderBy: { changedAt: "desc" },
      select: { username: true },
    });
    return rows.map((r) => r.username);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    userApiLogger.error({ action: "getUsernameHistory", error: message });
    return [];
  }
}

const CustomizationSchema = z.object({
  backdrop: z
    .object({
      mediaType: z.enum(["movie", "series"]),
      tmdbId: z.number().int().positive(),
      imagePath: z.string().max(200),
    })
    .nullable(),
  avatarImagePath: z.string().max(200).nullable(),
  accent: z.enum(["default", "midnight", "forest", "golden", "ocean", "sunset", "violet", "rose"]),
  bio: z.string().max(160),
  links: z.array(z.string().url().max(200)).max(3),
  location: z.string().max(60),
});

export async function updateProfileAction(
  input: ProfileCustomizationInput
): Promise<ActionResult> {
  try {
    const v = CustomizationSchema.parse(input);
    const userId = await requirePgUserId();
    // Wrap in auditedTransaction so the users-table UPDATE is attributed to
    // this user in audit_log (the trigger reads the audit.actor_id GUC).
    const user = await auditedTransaction(userId, async (tx) => {
      const u = await tx.user.findUnique({
        where: { id: userId },
        select: { username: true, metadata: true },
      });
      const env = parseEnvelope(u?.metadata);
      await tx.user.update({
        where: { id: userId },
        data: {
          bio: v.bio || null,
          metadata: {
            ...env,
            profile: {
              ...(env.profile ?? {}),
              backdrop: v.backdrop ?? undefined,
              avatarImagePath: v.avatarImagePath ?? undefined,
              accent: v.accent,
              links: v.links,
              // Free-text display location lives in `displayLocation`; the bare
              // `location` key holds the geo object (auth.ts/user-location.ts) for
              // the admin Users tab and is preserved by the spread above. Writing
              // a string here clobbered it (and crashed the editor's .trim()).
              displayLocation: v.location || undefined,
            },
          },
        },
      });
      return u;
    });
    if (user?.username) revalidatePath(`/u/${user.username}`);
    // DEPLOY FOLLOW-UP: single-path CloudFront invalidation /u/<username>* on privacy flips.
    return { ok: true };
  } catch (error: unknown) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

const LayoutWidgetSchema = z.object({
  id: z.string().min(1).max(64),
  type: z.string().min(1).max(40),
  x: z.number().int().min(0).max(48),
  y: z.number().int().min(0).max(1000),
  w: z.number().int().min(1).max(24),
  h: z.number().int().min(1).max(24),
  config: z.record(z.string(), z.unknown()).optional(),
});
const ProfileLayoutSchema = z.object({
  v: z.literal(1),
  cols: z.number().int().min(1).max(24),
  widgets: z.array(LayoutWidgetSchema).max(40),
});

/** Persist the owner's customized widget-dashboard layout (metadata.profile.layout). */
export async function updateProfileLayoutAction(input: { layout: unknown }): Promise<ActionResult> {
  try {
    const layout = ProfileLayoutSchema.parse(input.layout);
    const userId = await requirePgUserId();
    const user = await auditedTransaction(userId, async (tx) => {
      const u = await tx.user.findUnique({
        where: { id: userId },
        select: { username: true, metadata: true },
      });
      const env = parseEnvelope(u?.metadata);
      await tx.user.update({
        where: { id: userId },
        data: {
          // Layout config values are validated JSON; cast past Prisma's strict
          // InputJsonValue (the z.unknown() config poisons structural typing).
          metadata: { ...env, profile: { ...(env.profile ?? {}), layout } } as unknown as Prisma.InputJsonValue,
        },
      });
      return u;
    });
    if (user?.username) revalidatePath(`/u/${user.username}`);
    return { ok: true };
  } catch (error: unknown) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export async function setFourFavoritesAction(input: {
  items: { mediaType: TrackedMediaType; tmdbId: number }[];
}): Promise<ActionResult> {
  try {
    const items = z
      .array(z.object({ mediaType: z.enum(["movie", "series"]), tmdbId: z.number().int().positive() }))
      .max(4)
      .parse(input.items);
    const userId = await requirePgUserId();
    // Wrap in auditedTransaction so the lists write is attributed to this user.
    await auditedTransaction(userId, (tx) =>
      setFourFavorites(
        userId,
        items.map((i) =>
          i.mediaType === "movie" ? { movieId: i.tmdbId } : { seriesId: i.tmdbId }
        ),
        tx
      )
    );
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { username: true } });
    if (user?.username) revalidatePath(`/u/${user.username}`);
    return { ok: true };
  } catch (error: unknown) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export async function setPrivacyDefaultsAction(input: {
  logPrivatelyByDefault: boolean;
}): Promise<ActionResult> {
  try {
    const value = z.boolean().parse(input.logPrivatelyByDefault);
    const userId = await requirePgUserId();
    // Wrap in auditedTransaction so the users-table UPDATE is attributed to this user.
    await auditedTransaction(userId, async (tx) => {
      const user = await tx.user.findUnique({ where: { id: userId }, select: { metadata: true } });
      const env = parseEnvelope(user?.metadata);
      await tx.user.update({
        where: { id: userId },
        data: {
          metadata: { ...env, preferences: { ...(env.preferences ?? {}), logPrivatelyByDefault: value } },
        },
      });
    });
    return { ok: true };
  } catch (error: unknown) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export async function getOwnProfileSettings(): Promise<OwnProfileSettingsDTO> {
  const userId = await requirePgUserId();
  const [user, favorites, previousUsernames] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { username: true, name: true, image: true, bio: true, metadata: true },
    }),
    getFourFavorites(userId),
    getUsernameHistory(userId),
  ]);
  const env = parseEnvelope(user?.metadata);
  const fourFavorites: FavoriteItemDTO[] = favorites.map((f) => ({
    mediaType: f.movie ? "movie" : "series",
    tmdbId: f.movie?.id ?? f.series?.id ?? 0,
    title: f.movie?.title ?? f.series?.name ?? "",
    posterPath: f.movie?.posterPath ?? f.series?.posterPath ?? null,
  }));
  return {
    username: user?.username ?? null,
    displayName: user?.name ?? user?.username ?? "You",
    googleImageUrl: user?.image ?? null,
    customization: {
      backdrop: env.profile?.backdrop
        ? {
            mediaType: env.profile.backdrop.mediaType,
            tmdbId: env.profile.backdrop.tmdbId,
            imagePath: env.profile.backdrop.imagePath,
          }
        : null,
      avatarImagePath: env.profile?.avatarImagePath ?? null,
      accent: (env.profile?.accent ?? "default") as OwnProfileSettingsDTO["customization"]["accent"],
      bio: user?.bio ?? "",
      links: env.profile?.links ?? [],
      location: typeof env.profile?.displayLocation === "string" ? env.profile.displayLocation : "",
    },
    privacy: { logPrivatelyByDefault: env.preferences?.logPrivatelyByDefault ?? false },
    fourFavorites,
    previousUsernames,
  };
}

export interface BackdropTitleResult {
  mediaType: TrackedMediaType;
  tmdbId: number;
  title: string;
  year: string | null;
}

/**
 * Title search for the backdrop picker — queries TMDB directly (not the local
 * catalog), so a user can pick ANY movie/show for their backdrop even if it
 * isn't hydrated locally. Pairs with getTitleImages' TMDB image fallback.
 */
export async function searchTitlesForBackdrop(query: string): Promise<BackdropTitleResult[]> {
  const q = z.string().trim().min(1).max(100).parse(query);
  try {
    const res = await searchMulti(q);
    const results = (res.results ?? []) as Array<Record<string, unknown>>;
    return results
      .filter((r) => r.media_type === "movie" || r.media_type === "tv")
      .slice(0, 8)
      .map((r) => {
        const isMovie = r.media_type === "movie";
        const date = (isMovie ? r.release_date : r.first_air_date) as string | undefined;
        return {
          mediaType: isMovie ? ("movie" as const) : ("series" as const),
          tmdbId: r.id as number,
          title: (isMovie ? r.title : r.name) as string,
          year: date ? date.slice(0, 4) : null,
        };
      })
      .filter((r) => r.tmdbId && r.title);
  } catch (error: unknown) {
    userApiLogger.error({
      action: "searchTitlesForBackdrop",
      error: error instanceof Error ? error.message : String(error),
    });
    return [];
  }
}

export async function getTitleImages(input: {
  mediaType: TrackedMediaType;
  tmdbId: number;
}): Promise<{ backdrops: string[]; posters: string[] }> {
  const v = z
    .object({ mediaType: z.enum(["movie", "series"]), tmdbId: z.number().int().positive() })
    .parse(input);
  const where = v.mediaType === "movie" ? { movieId: v.tmdbId } : { seriesId: v.tmdbId };
  const rows = await prisma.image.findMany({
    where: { ...where, type: { in: ["BACKDROP", "POSTER"] } },
    orderBy: { voteAverage: "desc" },
    take: 40,
    select: { filePath: true, type: true },
  });
  let backdrops = rows.filter((r) => r.type === "BACKDROP").map((r) => r.filePath).slice(0, 12);
  let posters = rows.filter((r) => r.type === "POSTER").map((r) => r.filePath).slice(0, 12);

  // The local `images` table is only populated for hydrated titles — most
  // titles a user searches for their backdrop won't be in it, leaving the
  // picker empty. Fall back to TMDB (cached) so ANY title shows real artwork.
  if (backdrops.length === 0) {
    try {
      const tmdb =
        v.mediaType === "movie"
          ? await getMovieImages(v.tmdbId)
          : await getSeriesImages(v.tmdbId);
      backdrops = tmdb.backdrops.map((b) => b.file_path).slice(0, 12);
      if (posters.length === 0) posters = tmdb.posters.map((p) => p.file_path).slice(0, 12);
    } catch (error: unknown) {
      userApiLogger.error({
        action: "getTitleImages.tmdbFallback",
        tmdbId: v.tmdbId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return { backdrops, posters };
}
