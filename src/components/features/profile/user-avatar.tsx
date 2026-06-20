import type { CSSProperties } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { cropLayout, type AvatarCrop } from "@/lib/avatar-crop";
import { avatarInitials } from "@/lib/avatar-initials";

interface UserAvatarProps {
  /** Full image URL (TMDB-built or Google). Null → initials fallback. */
  src: string | null | undefined;
  /** Display name — drives the initials fallback. */
  name: string;
  /** Optional stored framing for a chosen TMDB image (zoom/pan). */
  crop?: AvatarCrop | null;
  /** Tailwind sizing + ring classes, e.g. "size-20 md:size-28 ring-2 ring-white/30". */
  className?: string;
  /** Fallback text size override (defaults scale with the avatar). */
  fallbackClassName?: string;
  alt?: string;
}

/**
 * The ONE avatar renderer for every user chip / hero / nav across the app.
 * Always `object-cover` (no more stretched posters), and when a `crop` is
 * present it re-applies the user's zoom/pan framing with pure CSS — faithfully
 * at any size (see `@/lib/avatar-crop`). Composes the shadcn Avatar (never edits
 * `components/ui`).
 */
export function UserAvatar({
  src,
  name,
  crop,
  className,
  fallbackClassName,
  alt = "",
}: UserAvatarProps) {
  const fallback = (
    <AvatarFallback className={cn("font-semibold", fallbackClassName)}>
      {avatarInitials(name)}
    </AvatarFallback>
  );

  if (!src) {
    return <Avatar className={className}>{fallback}</Avatar>;
  }

  if (crop) {
    const l = cropLayout(crop);
    const style: CSSProperties = {
      width: `${l.contentWidthPct}%`,
      height: `${l.contentHeightPct}%`,
      transform: `translate(${l.translateXPct}%, ${l.translateYPct}%) scale(${l.scale})`,
      transformOrigin: "0 0",
    };
    return (
      <Avatar className={className}>
        <AvatarImage
          src={src}
          alt={alt}
          referrerPolicy="no-referrer"
          // Inline width/height/transform override the shadcn `size-full`; the
          // Avatar root is already `relative overflow-hidden rounded-full`.
          className="absolute left-0 top-0 max-w-none object-cover"
          style={style}
        />
        {fallback}
      </Avatar>
    );
  }

  return (
    <Avatar className={className}>
      <AvatarImage src={src} alt={alt} referrerPolicy="no-referrer" className="object-cover" />
      {fallback}
    </Avatar>
  );
}
