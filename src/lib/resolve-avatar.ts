import { TMDB_IMAGE_BASE } from "@/lib/constants";
import { normalizeCrop, type AvatarCrop } from "@/lib/avatar-crop";
import { PROFILE_ACCENT_VARS } from "@/lib/profile-accents";
import type { ProfileAccent } from "@/types/social";

/**
 * Resolve the avatar to show for a user, ANYWHERE in the app, from their
 * `users.image` (Google photo) + `users.metadata` (which may hold a chosen TMDB
 * avatar + framing). A chosen avatar always wins; otherwise the Google photo.
 * Keep this the single source of truth so every surface (nav, reviews, comments,
 * lists, notifications, follows) shows the same picture.
 */

interface AvatarEnvelope {
  avatarImagePath?: string;
  avatarCrop?: unknown;
}

function profileBits(metadata: unknown): AvatarEnvelope {
  if (typeof metadata !== "object" || metadata === null) return {};
  const profile = (metadata as Record<string, unknown>).profile;
  if (typeof profile !== "object" || profile === null) return {};
  const p = profile as Record<string, unknown>;
  return {
    avatarImagePath: typeof p.avatarImagePath === "string" ? p.avatarImagePath : undefined,
    avatarCrop: p.avatarCrop,
  };
}

/** Full avatar URL: chosen TMDB avatar (w342) if set, else the Google photo, else null. */
export function resolveAvatarUrl(image: string | null | undefined, metadata: unknown): string | null {
  const { avatarImagePath } = profileBits(metadata);
  if (avatarImagePath) return `${TMDB_IMAGE_BASE}/w342${avatarImagePath}`;
  return image ?? null;
}

/** Framing for a chosen TMDB avatar (zoom/pan). Null for Google photos / no crop. */
export function resolveAvatarCrop(metadata: unknown): AvatarCrop | null {
  const { avatarImagePath, avatarCrop } = profileBits(metadata);
  return avatarImagePath ? normalizeCrop(avatarCrop) : null;
}

/** The user's chosen profile accent (drives their avatar ring everywhere). Defaults to "default". */
export function resolveAccent(metadata: unknown): ProfileAccent {
  if (typeof metadata !== "object" || metadata === null) return "default";
  const profile = (metadata as Record<string, unknown>).profile;
  if (typeof profile !== "object" || profile === null) return "default";
  const accent = (profile as Record<string, unknown>).accent;
  return typeof accent === "string" && accent in PROFILE_ACCENT_VARS
    ? (accent as ProfileAccent)
    : "default";
}
