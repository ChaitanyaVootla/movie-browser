import type { CSSProperties } from "react";
import Image from "next/image";
import { MapPin } from "lucide-react";
import { PROFILE_ACCENT_VARS } from "@/lib/profile-accents";
import { TMDB_IMAGE_BASE } from "@/lib/constants";
import type { AvatarCrop } from "@/lib/avatar-crop";
import type { ProfileAccent } from "@/types/social";
import { UserAvatar } from "@/components/features/profile/user-avatar";

interface PreviewProps {
  displayName: string;
  username: string | null;
  backdropImagePath: string | null;
  avatarUrl: string | null;
  avatarCrop: AvatarCrop | null;
  accent: ProfileAccent;
  bio: string;
  location: string;
}

/**
 * Live "this is how your profile looks" preview shown above the editor
 * controls. Mirrors the real ProfileHero (backdrop → scrim → identity) and
 * applies the chosen accent via scoped --brand vars (same mechanism as
 * AccentScope), so changing the accent / backdrop / avatar updates instantly.
 * Text sits over imagery → hardcoded white is correct (DESIGN.md exception).
 */
export function ProfileEditorPreview({
  displayName,
  username,
  backdropImagePath,
  avatarUrl,
  avatarCrop,
  accent,
  bio,
  location,
}: PreviewProps) {
  const vars = PROFILE_ACCENT_VARS[accent];
  const style: CSSProperties & Record<"--brand" | "--brand-rgb", string> = {
    "--brand": vars.brand,
    "--brand-rgb": vars.brandRgb,
  };

  return (
    <div style={style} className="overflow-hidden rounded-xl border bg-hero-base">
      <div className="relative h-36 w-full sm:h-44">
        {backdropImagePath ? (
          <Image
            src={`${TMDB_IMAGE_BASE}/w780${backdropImagePath}`}
            alt=""
            fill
            className="object-cover"
            sizes="(max-width: 640px) 100vw, 600px"
          />
        ) : (
          <div className="h-full w-full bg-gradient-to-br from-brand/25 via-hero-base to-hero-base" />
        )}
        {/* Bottom scrim so identity stays legible over any art. */}
        <div className="absolute inset-0 bg-gradient-to-t from-hero-base via-hero-base/40 to-transparent" />

        <div className="absolute inset-x-0 bottom-0 flex items-end gap-3 p-4">
          <UserAvatar
            src={avatarUrl}
            crop={avatarCrop}
            name={displayName}
            className="size-14 ring-2 ring-brand/80 sm:size-16"
            fallbackClassName="text-sm"
          />
          <div className="min-w-0 flex-1 pb-0.5">
            <p className="truncate text-lg font-bold tracking-tight text-white">{displayName}</p>
            <p className="truncate text-xs font-medium text-white/70">
              @{username ?? "your-handle"}
            </p>
          </div>
          <span className="rounded-full border border-white/25 bg-white/15 px-3 py-1 text-xs font-semibold text-white backdrop-blur-sm">
            Follow
          </span>
        </div>
      </div>

      {(bio.trim() || location.trim()) && (
        <div className="space-y-1.5 p-4">
          {bio.trim() && (
            <p className="text-sm leading-relaxed text-foreground line-clamp-2">{bio}</p>
          )}
          {location.trim() && (
            <p className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
              <MapPin className="h-3 w-3" />
              {location}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
