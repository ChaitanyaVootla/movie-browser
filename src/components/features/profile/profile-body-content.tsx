import { AccentScope } from "./accent-scope";
import { ProfileHero } from "./profile-hero";
import { ProfileDashboard } from "./profile-dashboard";
import { ProfileDashboardSwitch } from "./profile-dashboard-switch";
import { ProfileSetupCard } from "./profile-setup-card";
import { ProfileVisitorEmpty } from "./profile-visitor-empty";
import { TasteMatchSlot, TasteOwnerHintSlot } from "./taste-viewer-slots";
import { PAGE_PADDING_X, OVERLINE } from "@/lib/design";
import type { PublicProfileDTO, TasteHintState } from "@/types/social";

/** The owner hint is a client island: hand it the status, not the snapshot. */
function hintState(taste: PublicProfileDTO["taste"]): TasteHintState | null {
  if (!taste) return null;
  return taste.status === "ready" ? { status: "ready" } : taste;
}

/**
 * The full profile body (accent scope + hero + dashboard grid). Pure
 * presentational — NO "use client" — so it renders server-side (zero-JS,
 * cacheable) for the public/visitor path AND client-side (driven by fresh data)
 * for the owner-fresh path. The two consumers:
 *   - `app/u/[username]/page.tsx` (server, cached) → visitors + SSR
 *   - `owner-fresh-body.tsx` (client) → the owner, re-rendered from uncached data
 * Keep it free of server-only APIs so the client consumer can render it.
 */
export function ProfileBodyContent({ profile }: { profile: PublicProfileDTO }) {
  const isEmptyProfile =
    profile.fourFavorites.length === 0 &&
    profile.reviews.length === 0 &&
    profile.discussions.length === 0 &&
    profile.currentlyWatching.length === 0 &&
    profile.pinnedLists.length === 0 &&
    profile.topGenres.length === 0 &&
    profile.topDecades.length === 0 &&
    !profile.ratingsHistogram.some((n) => n > 0) &&
    profile.counts.filmsWatched + profile.counts.episodesWatched === 0;

  return (
    <AccentScope accent={profile.accent}>
      <article className="pb-12">
        <ProfileHero profile={profile} />

        <div className={`profile-stagger mx-auto w-full max-w-7xl ${PAGE_PADDING_X} pt-5 md:pt-6 space-y-6 md:space-y-8`}>
          {/* Taste match (viewer ↔ owner) — the first thing a signed-in visitor
              sees (taste v2 §4.9). Client island: renders nothing in the cached
              HTML; gated + PUBLIC-scope server-side. */}
          <TasteMatchSlot username={profile.username} displayName={profile.displayName} />
          <ProfileSetupCard
            flags={{
              hasBackdrop: profile.backdrop !== null,
              hasFourFavorites: profile.fourFavorites.length > 0,
              hasBio: Boolean(profile.bio),
              hasLogged: profile.counts.filmsWatched + profile.counts.episodesWatched > 0,
              hasReview: profile.reviews.length > 0,
            }}
          />
          <ProfileVisitorEmpty displayName={profile.displayName} isEmpty={isEmptyProfile} />
          <ProfileDashboardSwitch>
            <ProfileDashboard profile={profile} />
          </ProfileDashboardSwitch>
          <TasteOwnerHintSlot taste={hintState(profile.taste)} />

          <p className={OVERLINE}>
            Member since{" "}
            {new Date(profile.joinedAt).toLocaleDateString("en-US", {
              month: "long",
              year: "numeric",
            })}
          </p>
        </div>
      </article>
    </AccentScope>
  );
}
