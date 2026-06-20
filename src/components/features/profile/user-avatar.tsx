import type { CSSProperties } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { cropLayout, type AvatarCrop } from "@/lib/avatar-crop";
import { avatarInitials } from "@/lib/avatar-initials";
import { PROFILE_ACCENT_VARS } from "@/lib/profile-accents";
import type { ProfileAccent } from "@/types/social";

interface UserAvatarProps {
  /** Full image URL (TMDB-built or Google). Null → initials fallback. */
  src: string | null | undefined;
  /** Display name — drives the initials fallback. */
  name: string;
  /** Optional stored framing for a chosen TMDB image (zoom/pan). */
  crop?: AvatarCrop | null;
  /**
   * The user's profile accent. When set, draws a ring in that accent's color
   * (everyone has one — "default" = Cinematic). Omit on utility avatars (e.g.
   * picker thumbnails) that shouldn't carry an identity ring.
   */
  accent?: ProfileAccent | null;
  /** Accent ring thickness in px (default 2; pass ~1.5 for very small avatars). */
  ringWidthPx?: number;
  /** Tailwind sizing classes, e.g. "size-20 md:size-28". */
  className?: string;
  /** Fallback text size override (defaults scale with the avatar). */
  fallbackClassName?: string;
  alt?: string;
}

/**
 * The ONE avatar renderer for every user chip / hero / nav across the app.
 * Always `object-cover` (no more stretched posters); re-applies the user's
 * zoom/pan framing when a `crop` is present (faithfully at any size, see
 * `@/lib/avatar-crop`); and draws the user's accent ring (`accent`) so their
 * identity color follows them everywhere. Composes the shadcn Avatar (never
 * edits `components/ui`).
 */
export function UserAvatar({
  src,
  name,
  crop,
  accent,
  ringWidthPx = 2,
  className,
  fallbackClassName,
  alt = "",
}: UserAvatarProps) {
  // A box-shadow ring (not the Tailwind `ring` util) so the color is fully under
  // our control and unaffected by the page/viewer accent; it follows the
  // rounded edge and isn't clipped by the avatar's `overflow-hidden`.
  const rootStyle: CSSProperties | undefined = accent
    ? { boxShadow: `0 0 0 ${ringWidthPx}px ${PROFILE_ACCENT_VARS[accent].brand}` }
    : undefined;

  const fallback = (
    <AvatarFallback className={cn("font-semibold", fallbackClassName)}>
      {avatarInitials(name)}
    </AvatarFallback>
  );

  let inner = fallback;
  if (src && crop) {
    const l = cropLayout(crop);
    inner = (
      <>
        <AvatarImage
          src={src}
          alt={alt}
          referrerPolicy="no-referrer"
          // Inline width/height/transform override the shadcn `size-full`; the
          // Avatar root is already `relative overflow-hidden rounded-full`.
          className="absolute left-0 top-0 max-w-none object-cover"
          style={{
            width: `${l.contentWidthPct}%`,
            height: `${l.contentHeightPct}%`,
            transform: `translate(${l.translateXPct}%, ${l.translateYPct}%) scale(${l.scale})`,
            transformOrigin: "0 0",
          }}
        />
        {fallback}
      </>
    );
  } else if (src) {
    inner = (
      <>
        <AvatarImage src={src} alt={alt} referrerPolicy="no-referrer" className="object-cover" />
        {fallback}
      </>
    );
  }

  return (
    <Avatar className={className} style={rootStyle}>
      {inner}
    </Avatar>
  );
}
