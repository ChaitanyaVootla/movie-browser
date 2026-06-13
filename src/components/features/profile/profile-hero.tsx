import Link from "next/link";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { HeroBackdropShell } from "@/components/features/media/hero-backdrop-shell";
import { getMediaPath } from "@/lib/utils";
import type { PublicProfileDTO } from "@/types/social";
import { UserModerationMenu } from "@/components/features/discussion";
import { FollowButton } from "./follow-button";
import { OwnerActions } from "./owner-actions";

/**
 * Identity hero: user-chosen title backdrop through the existing
 * hero-backdrop/gradient system. With no backdrop chosen, a plain dark header
 * band renders content at natural height.
 * Text over imagery uses text-white (DESIGN.md Colors exception).
 */
export function ProfileHero({ profile }: { profile: PublicProfileDTO }) {
  const backdrop = profile.backdrop;

  const identity = (
    <div className="flex flex-col items-center text-center md:items-start md:text-left md:h-full md:justify-end md:px-8 lg:px-12">
      <div className="hero-content-width flex flex-col items-center md:items-start gap-3 pb-5 md:pb-8">
        <Avatar className="size-20 md:size-28 ring-2 ring-white/30">
          {profile.avatarUrl && (
            <AvatarImage src={profile.avatarUrl} alt="" referrerPolicy="no-referrer" />
          )}
          <AvatarFallback className="text-xl font-semibold">
            {profile.displayName.slice(0, 2).toUpperCase()}
          </AvatarFallback>
        </Avatar>

        <div>
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-white">
            {profile.displayName}
          </h1>
          <p className="text-sm font-medium text-white/70">@{profile.username}</p>
        </div>

        {profile.bio && (
          <p className="max-w-xl text-sm leading-relaxed text-white/90 line-clamp-3">
            {profile.bio}
          </p>
        )}

        {profile.links.length > 0 && (
          <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 md:justify-start">
            {profile.links.slice(0, 3).map((link) => (
              <a
                key={link}
                href={link}
                target="_blank"
                rel="noopener noreferrer nofollow"
                className="text-xs font-medium text-white/70 underline-offset-2 hover:text-white hover:underline"
              >
                {link.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "")}
              </a>
            ))}
          </div>
        )}

        <div className="flex flex-wrap items-center justify-center gap-3 md:justify-start">
          <FollowButton username={profile.username} />
          <OwnerActions username={profile.username} />
          <UserModerationMenu username={profile.username} />
          <span className="text-xs font-medium text-white/70">
            <strong className="text-white">{profile.counts.followers.toLocaleString()}</strong>{" "}
            followers ·{" "}
            <strong className="text-white">{profile.counts.following.toLocaleString()}</strong>{" "}
            following ·{" "}
            <strong className="text-white">{profile.counts.filmsWatched.toLocaleString()}</strong>{" "}
            films
          </span>
        </div>

        {backdrop && (
          <Link
            href={getMediaPath(backdrop.mediaType, backdrop.tmdbId, backdrop.titleName)}
            prefetch={false}
            className="text-[10px] font-medium uppercase tracking-wider text-white/50 hover:text-white/80 transition-colors"
          >
            Backdrop · {backdrop.titleName}
          </Link>
        )}
      </div>
    </div>
  );

  if (!backdrop) {
    // No backdrop chosen: plain dark header band (compact, no image void)
    return (
      <section className="relative bg-hero-base" data-hero-root>
        <div className="pt-[calc(env(safe-area-inset-top,0px)+2.5rem)] md:pt-24 pb-6 px-4 md:px-0">
          {identity}
        </div>
      </section>
    );
  }

  return (
    <section className="relative">
      <div className="hero-container relative w-full overflow-hidden">
        <HeroBackdropShell
          mediaId={backdrop.tmdbId}
          mediaType={backdrop.mediaType}
          tmdbBackdropPath={backdrop.imagePath}
          overlay="medium"
        >
          {identity}
        </HeroBackdropShell>
      </div>
    </section>
  );
}
