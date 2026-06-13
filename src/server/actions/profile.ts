"use server";

import { z } from "zod";
import { requirePgUserId } from "@/lib/user-id";
import { userApiLogger } from "@/lib/logger";
import { prisma } from "@/server/db/postgres";
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
    await prisma.user.update({ where: { id: userId }, data: { username } });
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
    if (input.follow) {
      await assertNotBlocked(viewerId, target.id);
      await followUser(viewerId, target.id);
    } else {
      await unfollowUser(viewerId, target.id);
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
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { username: true, metadata: true },
    });
    const env = parseEnvelope(user?.metadata);
    await prisma.user.update({
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
            location: v.location || undefined,
          },
        },
      },
    });
    if (user?.username) revalidatePath(`/u/${user.username}`);
    // DEPLOY FOLLOW-UP: single-path CloudFront invalidation /u/<username>* on privacy flips.
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
    await setFourFavorites(
      userId,
      items.map((i) =>
        i.mediaType === "movie" ? { movieId: i.tmdbId } : { seriesId: i.tmdbId }
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
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { metadata: true } });
    const env = parseEnvelope(user?.metadata);
    await prisma.user.update({
      where: { id: userId },
      data: {
        metadata: { ...env, preferences: { ...(env.preferences ?? {}), logPrivatelyByDefault: value } },
      },
    });
    return { ok: true };
  } catch (error: unknown) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export async function getOwnProfileSettings(): Promise<OwnProfileSettingsDTO> {
  const userId = await requirePgUserId();
  const [user, favorites] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { username: true, name: true, image: true, bio: true, metadata: true },
    }),
    getFourFavorites(userId),
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
      location: env.profile?.location ?? "",
    },
    privacy: { logPrivatelyByDefault: env.preferences?.logPrivatelyByDefault ?? false },
    fourFavorites,
  };
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
  return {
    backdrops: rows.filter((r) => r.type === "BACKDROP").map((r) => r.filePath).slice(0, 12),
    posters: rows.filter((r) => r.type === "POSTER").map((r) => r.filePath).slice(0, 12),
  };
}
