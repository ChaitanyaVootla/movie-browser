import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Script from "next/script";
import { Star } from "lucide-react";
import { getPerson } from "@/server/actions/person";
import { PersonHero, PersonFilmography, PersonImages } from "@/components/features/person";
import { MovieCard } from "@/components/features/movie/movie-card";
import { MediaScroller } from "@/components/features/media/media-scroller";
import { SITE_URL, TMDB_IMAGE_BASE } from "@/lib/constants";
import type { MovieListItem, SeriesListItem } from "@/types";

interface PersonPageProps {
  params: Promise<{
    params: string[]; // [personId] or [personId, slug]
  }>;
}

// Generate SEO metadata
export async function generateMetadata({ params }: PersonPageProps): Promise<Metadata> {
  const { params: routeParams } = await params;
  const personId = routeParams[0];
  const id = parseInt(personId, 10);

  if (isNaN(id)) {
    return { title: "Person Not Found" };
  }

  const person = await getPerson(id);

  if (!person) {
    return { title: "Person Not Found" };
  }

  // Build description from biography or known works
  let description = person.biography?.slice(0, 160);
  if (!description && person.known_for_department) {
    const knownFor = person.combined_credits?.cast?.slice(0, 3) || [];
    const titles = knownFor.map((c) => c.title || c.name).filter(Boolean);
    description = `${person.name} is a ${person.known_for_department.toLowerCase()} known for ${titles.join(", ")}.`;
  }
  if (!description) {
    description = `View ${person.name}'s filmography, biography, and photos.`;
  }

  const profileUrl = person.profile_path
    ? `${TMDB_IMAGE_BASE}/w500${person.profile_path}`
    : undefined;

  // Build keywords
  const keywords = [
    person.name,
    person.known_for_department,
    "actor",
    "actress",
    "director",
    "filmography",
    "movies",
    "tv shows",
  ].filter(Boolean) as string[];

  // Add known for titles
  const topCredits = person.combined_credits?.cast?.slice(0, 5) || [];
  topCredits.forEach((c) => {
    const title = c.title || c.name;
    if (title) keywords.push(title);
  });

  return {
    title: person.name,
    description,
    keywords: [...new Set(keywords)],
    openGraph: {
      type: "profile",
      title: person.name,
      description,
      url: `${SITE_URL}/person/${person.id}`,
      images: profileUrl
        ? [
            {
              url: profileUrl,
              width: 500,
              height: 750,
              alt: `${person.name} profile photo`,
            },
          ]
        : [],
      firstName: person.name.split(" ")[0],
      lastName: person.name.split(" ").slice(1).join(" "),
    },
    twitter: {
      card: "summary",
      title: person.name,
      description,
      images: profileUrl ? [profileUrl] : [],
    },
    alternates: {
      canonical: `${SITE_URL}/person/${person.id}`,
    },
  };
}

// JSON-LD structured data for SEO
function PersonSchema({
  person,
}: {
  person: NonNullable<Awaited<ReturnType<typeof getPerson>>>;
}) {
  // Get notable works
  const notableWorks = person.combined_credits?.cast
    ?.sort((a, b) => (b.popularity || 0) - (a.popularity || 0))
    .slice(0, 10)
    .map((c) => ({
      "@type": c.media_type === "movie" ? "Movie" : "TVSeries",
      name: c.title || c.name,
      url: `${SITE_URL}/${c.media_type === "movie" ? "movie" : "series"}/${c.id}`,
    }));

  const schema = {
    "@context": "https://schema.org",
    "@type": "Person",
    name: person.name,
    description: person.biography?.slice(0, 500),
    image: person.profile_path
      ? `${TMDB_IMAGE_BASE}/w500${person.profile_path}`
      : undefined,
    birthDate: person.birthday,
    deathDate: person.deathday || undefined,
    birthPlace: person.place_of_birth || undefined,
    jobTitle: person.known_for_department,
    url: `${SITE_URL}/person/${person.id}`,
    sameAs: [
      person.imdb_id && `https://www.imdb.com/name/${person.imdb_id}`,
      person.external_ids?.instagram_id &&
        `https://www.instagram.com/${person.external_ids.instagram_id}`,
      person.external_ids?.twitter_id &&
        `https://www.twitter.com/${person.external_ids.twitter_id}`,
      person.external_ids?.facebook_id &&
        `https://www.facebook.com/${person.external_ids.facebook_id}`,
      person.external_ids?.wikidata_id &&
        `https://www.wikidata.org/wiki/${person.external_ids.wikidata_id}`,
      person.homepage,
    ].filter(Boolean),
    performerIn: notableWorks,
  };

  return (
    <Script
      id="person-schema"
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
    />
  );
}

// Known For Section - Top credits scroller using MovieCard
function KnownForSection({
  person,
}: {
  person: NonNullable<Awaited<ReturnType<typeof getPerson>>>;
}) {
  // Get top credits sorted by popularity
  const topCredits = person.combined_credits?.cast
    ?.filter((c) => c.poster_path) // Only show ones with posters
    .sort((a, b) => (b.popularity || 0) - (a.popularity || 0))
    .slice(0, 12);

  if (!topCredits || topCredits.length === 0) return null;

  // Convert to MovieListItem/SeriesListItem
  const items = topCredits.map((credit): MovieListItem | SeriesListItem => {
    if (credit.media_type === "movie") {
      return {
        id: credit.id,
        title: credit.title || "",
        poster_path: credit.poster_path,
        backdrop_path: credit.backdrop_path,
        vote_average: credit.vote_average,
        vote_count: credit.vote_count,
        release_date: credit.release_date || "",
        genre_ids: credit.genre_ids,
        overview: credit.overview,
        popularity: credit.popularity,
        adult: credit.adult,
        media_type: "movie",
      };
    } else {
      return {
        id: credit.id,
        name: credit.name || "",
        poster_path: credit.poster_path,
        backdrop_path: credit.backdrop_path,
        vote_average: credit.vote_average,
        vote_count: credit.vote_count,
        first_air_date: credit.first_air_date || "",
        genre_ids: credit.genre_ids,
        overview: credit.overview,
        popularity: credit.popularity,
        adult: credit.adult,
        media_type: "tv",
      };
    }
  });

  return (
    <MediaScroller
      title="Known For"
      titleIcon={<Star className="h-5 w-5 text-yellow-500" />}
      className="mt-8"
    >
      {items.map((item, idx) => (
        <MovieCard
          key={`${item.id}-${idx}`}
          item={item}
          className="w-[130px] sm:w-[145px] md:w-[160px] flex-shrink-0"
          showRating
        />
      ))}
    </MediaScroller>
  );
}

export default async function PersonPage({ params }: PersonPageProps) {
  const { params: routeParams } = await params;
  const personId = routeParams[0];
  const id = parseInt(personId, 10);

  if (isNaN(id)) {
    notFound();
  }

  const person = await getPerson(id);

  if (!person) {
    notFound();
  }

  // Get profile images
  const profileImages = person.images?.profiles || [];

  return (
    <>
      <PersonSchema person={person} />

      <article className="pb-12">
        {/* Hero section with profile image, bio, and external links */}
        <PersonHero person={person} />

        {/* Known For - Top credits */}
        <KnownForSection person={person} />

        {/* Photo Gallery */}
        {profileImages.length > 1 && (
          <PersonImages
            images={profileImages}
            personName={person.name}
            className="mt-8"
          />
        )}

        {/* Full Filmography */}
        <PersonFilmography person={person} className="mt-8" />
      </article>
    </>
  );
}

