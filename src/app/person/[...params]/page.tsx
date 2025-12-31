import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Script from "next/script";
import { getPerson } from "@/server/actions/person";
import { PersonHero, PersonFilmography, PersonImages, KnownForSection, UpcomingLatestSection } from "@/components/features/person";
import { SITE_URL, TMDB_IMAGE_BASE } from "@/lib/constants";

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

        {/* Upcoming & Latest - recent and upcoming projects */}
        {person.combined_credits && (
          <UpcomingLatestSection
            castCredits={person.combined_credits.cast || []}
            crewCredits={person.combined_credits.crew || []}
            className="mt-8"
          />
        )}

        {/* Known For - Top credits */}
        {person.combined_credits?.cast && person.combined_credits.cast.length > 0 && (
          <KnownForSection
            credits={person.combined_credits.cast}
            className="mt-8"
          />
        )}

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

