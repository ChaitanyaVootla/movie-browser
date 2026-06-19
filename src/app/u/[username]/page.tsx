import { cache } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Lock } from "lucide-react";
import { getPublicProfile as getPublicProfileBase } from "@/server/actions/profile";
import { PageMain } from "@/components/features/layout/page-main";
import { AccentScope } from "@/components/features/profile/accent-scope";
import { ProfileViewerProvider } from "@/components/features/profile/profile-viewer-context";
import { ProfileHero } from "@/components/features/profile/profile-hero";
import { ProfileDashboard } from "@/components/features/profile/profile-dashboard";
import { ProfileDashboardSwitch } from "@/components/features/profile/profile-dashboard-switch";
import { ProfileSetupCard } from "@/components/features/profile/profile-setup-card";
import { ProfileVisitorEmpty } from "@/components/features/profile/profile-visitor-empty";
import { PAGE_PADDING_X, OVERLINE } from "@/lib/design";
import { SITE_NAME, SITE_URL, TMDB_IMAGE_BASE } from "@/lib/constants";
import { truncateAtWord } from "@/lib/utils";

// Deduplicate within the request (generateMetadata + page render)
const getPublicProfile = cache(getPublicProfileBase);

// ISR with SHORT revalidate (roadmap §4.1.8: public profiles edge-cache with
// short s-maxage; username/privacy flips invalidate /u/<username>* on the
// backend side). No viewer-specific content renders server-side here.
export const revalidate = 300;

// REQUIRED for ISR on dynamic routes (see movie/series pages): without
// generateStaticParams, `revalidate` is a no-op.
export async function generateStaticParams(): Promise<{ username: string }[]> {
  return [];
}

interface ProfilePageProps {
  params: Promise<{ username: string }>;
}

export async function generateMetadata({ params }: ProfilePageProps): Promise<Metadata> {
  const { username } = await params;
  const profile = await getPublicProfile(username.toLowerCase());

  if (!profile) notFound();

  if (!profile.isPublic) {
    return {
      title: `@${profile.username} | ${SITE_NAME}`,
      robots: { index: false, follow: false },
    };
  }

  const title = `${profile.displayName} (@${profile.username}) | ${SITE_NAME}`;
  const statsBit = `${profile.counts.filmsWatched.toLocaleString()} films · ${profile.counts.episodesWatched.toLocaleString()} episodes · ${profile.counts.followers.toLocaleString()} followers`;
  const description = truncateAtWord(
    profile.bio ? `${profile.bio} — ${statsBit}` : `${profile.displayName} on ${SITE_NAME}. ${statsBit}.`,
    160
  );
  const ogImage = profile.backdrop
    ? `${TMDB_IMAGE_BASE}/w1280${profile.backdrop.imagePath}`
    : (profile.avatarUrl ?? undefined);
  const canonical = `${SITE_URL}/u/${profile.username}`;

  return {
    title: { absolute: title },
    description,
    alternates: { canonical },
    openGraph: {
      type: "profile",
      siteName: SITE_NAME,
      title,
      description,
      url: canonical,
      images: ogImage ? [{ url: ogImage, alt: `${profile.displayName}'s profile` }] : [],
    },
    twitter: {
      card: profile.backdrop ? "summary_large_image" : "summary",
      title,
      description,
      images: ogImage ? [ogImage] : [],
    },
  };
}

function ProfileJsonLd({ profile }: { profile: NonNullable<Awaited<ReturnType<typeof getPublicProfile>>> }) {
  const schema = {
    "@context": "https://schema.org",
    "@type": "ProfilePage",
    dateCreated: profile.joinedAt,
    mainEntity: {
      "@type": "Person",
      name: profile.displayName,
      alternateName: profile.username,
      identifier: profile.username,
      description: profile.bio ?? undefined,
      image: profile.avatarUrl ?? undefined,
      url: `${SITE_URL}/u/${profile.username}`,
      sameAs: profile.links.length > 0 ? profile.links : undefined,
      interactionStatistic: [
        {
          "@type": "InteractionCounter",
          interactionType: "https://schema.org/FollowAction",
          userInteractionCount: profile.counts.followers,
        },
      ],
    },
  };
  return (
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }} />
  );
}

export default async function PublicProfilePage({ params }: ProfilePageProps) {
  const { username } = await params;
  const profile = await getPublicProfile(username.toLowerCase());

  if (!profile) notFound();

  if (!profile.isPublic) {
    return (
      <PageMain>
        <div className="mx-auto flex min-h-[50dvh] max-w-md flex-col items-center justify-center gap-3 text-center">
          <Lock className="h-8 w-8 text-muted-foreground" />
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">@{profile.username}</h1>
          <p className="text-sm text-muted-foreground">This profile is private.</p>
        </div>
      </PageMain>
    );
  }

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
      <ProfileViewerProvider username={profile.username}>
        <article className="pb-12">
        <ProfileJsonLd profile={profile} />
        <ProfileHero profile={profile} />

        <div className={`profile-stagger mx-auto w-full max-w-7xl ${PAGE_PADDING_X} pt-5 md:pt-6 space-y-6 md:space-y-8`}>
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
          <ProfileDashboardSwitch profile={profile}>
            <ProfileDashboard profile={profile} />
          </ProfileDashboardSwitch>

          {/* Reserved slot: phase-2 taste-compatibility module ("you're 87%
              compatible" + share card) renders here. Do not fill. */}

          <p className={OVERLINE}>
            Member since{" "}
            {new Date(profile.joinedAt).toLocaleDateString("en-US", {
              month: "long",
              year: "numeric",
            })}
          </p>
        </div>
        </article>
      </ProfileViewerProvider>
    </AccentScope>
  );
}
