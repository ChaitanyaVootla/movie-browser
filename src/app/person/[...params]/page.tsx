import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getPerson } from "@/server/actions/person";
import {
  PersonHero,
  PersonFilmography,
  PersonImages,
  KnownForSection,
  UpcomingLatestSection,
} from "@/components/features/person";
import { SITE_URL, TMDB_IMAGE_BASE } from "@/lib/constants";
import {
  extractPersonHeroProps,
  extractKnownForCredits,
  extractUpcomingLatestCredits,
  extractFilmographyCredits,
  extractPersonImages,
} from "@/types/client-props";

interface PersonPageProps {
  params: Promise<{
    params: string[]; // [personId] or [personId, slug]
  }>;
  searchParams: Promise<{
    __e2e_error?: string; // Test-only: triggers error boundary for E2E testing
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
function PersonSchema({ person }: { person: NonNullable<Awaited<ReturnType<typeof getPerson>>> }) {
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
    image: person.profile_path ? `${TMDB_IMAGE_BASE}/w500${person.profile_path}` : undefined,
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
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
    />
  );
}

export default async function PersonPage({ params, searchParams }: PersonPageProps) {
  const { params: routeParams } = await params;
  const { __e2e_error } = await searchParams;
  const personId = routeParams[0];
  const id = parseInt(personId, 10);

  if (isNaN(id)) {
    notFound();
  }

  // E2E test trigger: throw an error to test error boundary
  // Only works in development/test, never in production
  if (__e2e_error === "true" && process.env.NODE_ENV !== "production") {
    throw new Error("E2E Test Error: Simulated error for error boundary testing");
  }

  const person = await getPerson(id);

  if (!person) {
    notFound();
  }

  // Extract only the fields needed by each client component (RSC payload optimization)
  // This reduces ~857KB → ~350KB by removing unused fields like overview from credits
  const heroProps = extractPersonHeroProps(person);
  const knownForCredits = extractKnownForCredits(person.combined_credits?.cast, 15);
  const upcomingLatestCredits = extractUpcomingLatestCredits(
    person.combined_credits?.cast,
    person.combined_credits?.crew,
    20, // cast limit
    10 // crew limit
  );
  const filmographyData = {
    id: person.id,
    combined_credits: extractFilmographyCredits(
      person.combined_credits?.cast,
      person.combined_credits?.crew,
      100, // cast limit
      50 // crew limit
    ),
  };
  const profileImages = extractPersonImages(person.images?.profiles, 12);

  return (
    <>
      <PersonSchema person={person} />

      <article className="pb-12">
        {/* Hero section with profile image, bio, and external links */}
        <PersonHero person={heroProps} />

        {/* Upcoming & Latest - recent and upcoming projects */}
        {(upcomingLatestCredits.cast.length > 0 || upcomingLatestCredits.crew.length > 0) && (
          <UpcomingLatestSection
            castCredits={upcomingLatestCredits.cast}
            crewCredits={upcomingLatestCredits.crew}
            className="mt-8"
          />
        )}

        {/* Known For - Top credits */}
        {knownForCredits.length > 0 && (
          <KnownForSection credits={knownForCredits} className="mt-8" />
        )}

        {/* Photo Gallery */}
        {profileImages.length > 1 && (
          <PersonImages images={profileImages} personName={person.name} className="mt-8" />
        )}

        {/* Full Filmography */}
        <PersonFilmography person={filmographyData} className="mt-8" />
      </article>
    </>
  );
}
