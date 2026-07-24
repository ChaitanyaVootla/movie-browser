import { Suspense, cache } from "react";
import { notFound, permanentRedirect } from "next/navigation";
import type { Metadata } from "next";
import { getPerson as getPersonBase } from "@/server/actions/person";
import { personExists } from "@/server/services/media-exists";

// Deduplicate getPerson calls within the same request
// (generateMetadata + PersonContentAsync share the same cached result)
const getPerson = cache(getPersonBase);
import { getMediaPath, truncateAtWord } from "@/lib/utils";
import { breadcrumbList } from "@/lib/seo/jsonld";

// ISR: cache the rendered person page for 24h (person/filmography data is very
// stable). Cuts SSR CPU under crawler traffic; TMDB person cache is 24h anyway.
export const revalidate = 86400;

// REQUIRED for ISR: without generateStaticParams, a dynamic route is rendered
// per-request and `revalidate` above is a no-op (verified: no route-cache
// entries ever written). Empty array = prerender nothing at build time, but
// cache every on-demand render for the revalidate window (dynamicParams
// defaults to true).
export async function generateStaticParams(): Promise<{ params: string[] }[]> {
  return [];
}
import {
  PersonHero,
  PersonFilmography,
  PersonImages,
  KnownForSection,
  UpcomingLatestSection,
} from "@/components/features/person";
import { MediaContextUpdater } from "@/components/features/media";
import { Skeleton } from "@/components/ui/skeleton";
import { SITE_NAME, SITE_URL, TMDB_IMAGE_BASE } from "@/lib/constants";
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

  // notFound() must be thrown HERE, not in the page body: loading.tsx streams
  // a 200 shell as soon as metadata resolves, so the page body can no longer
  // change the status code. This is the only place a real 404 can happen.
  if (isNaN(id)) {
    notFound();
  }

  const person = await getPerson(id);

  if (!person) {
    // Distinguish "definitively missing" (real 404, ISR-cacheable) from a
    // transient fetch failure (keep today's graceful 200 shell render).
    if (!(await personExists(id))) {
      notFound();
    }
    return { title: "Person Not Found" };
  }

  // Single canonical URL form (slugged) — see movie page generateMetadata.
  const canonicalPath = getMediaPath("person", person.id, person.name);
  if (`/person/${routeParams.join("/")}` !== canonicalPath) {
    permanentRedirect(canonicalPath);
  }

  // Build description from biography or known works
  let description = person.biography ? truncateAtWord(person.biography, 160) : undefined;
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
    // Adult performers stay reachable but out of search indexes (they also
    // never enter the sitemap). Derived from the already-fetched TMDB data —
    // no dynamic APIs, so ISR is unaffected.
    ...(person.adult ? { robots: { index: false, follow: false } } : {}),
    openGraph: {
      type: "profile",
      siteName: SITE_NAME,
      locale: "en_US",
      title: person.name,
      description,
      url: `${SITE_URL}${canonicalPath}`,
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
      canonical: `${SITE_URL}${canonicalPath}`,
      // LLM-friendly markdown twin: <link rel="alternate" type="text/markdown">
      types: { "text/markdown": `${SITE_URL}${canonicalPath}.md` },
    },
  };
}

const DEPARTMENT_TO_JOB: Record<string, string> = {
  Acting: "Actor",
  Directing: "Director",
  Writing: "Writer",
  Production: "Producer",
  Camera: "Cinematographer",
  Editing: "Editor",
  Sound: "Sound Engineer",
  Art: "Art Director",
  "Costume & Make-Up": "Costume Designer",
  "Visual Effects": "Visual Effects Artist",
};

// JSON-LD structured data for SEO
function PersonSchema({ person }: { person: NonNullable<Awaited<ReturnType<typeof getPerson>>> }) {
  const canonicalPath = getMediaPath("person", person.id, person.name);
  // Get notable works
  const notableWorks = person.combined_credits?.cast
    ?.sort((a, b) => (b.popularity || 0) - (a.popularity || 0))
    .slice(0, 10)
    .map((c) => ({
      "@type": c.media_type === "movie" ? "Movie" : "TVSeries",
      name: c.title || c.name,
      url: `${SITE_URL}${getMediaPath(c.media_type === "movie" ? "movie" : "series", c.id, c.title || c.name)}`,
    }));

  const schema = {
    "@context": "https://schema.org",
    "@type": "Person",
    name: person.name,
    description: person.biography ? truncateAtWord(person.biography, 500) : undefined,
    image: person.profile_path ? `${TMDB_IMAGE_BASE}/w500${person.profile_path}` : undefined,
    birthDate: person.birthday,
    deathDate: person.deathday || undefined,
    birthPlace: person.place_of_birth || undefined,
    // Map TMDB department names to human job titles ("Acting" -> "Actor")
    jobTitle: DEPARTMENT_TO_JOB[person.known_for_department] ?? person.known_for_department,
    url: `${SITE_URL}${canonicalPath}`,
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

  const breadcrumbs = breadcrumbList([{ name: "Home", path: "/" }, { name: person.name }]);

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbs) }}
      />
    </>
  );
}

// Streaming skeleton shown while PersonContentAsync resolves. Mirrors the
// settled PersonHero layout (same paddings, profile-photo block, name bar, bio
// lines) so the swap-in causes minimal layout shift, plus a card-row
// placeholder where the first credits scroller lands.
function PersonPageSkeleton() {
  return (
    <article className="pb-12">
      <section className="relative bg-gradient-to-b from-background/50 to-background">
        <div className="px-4 md:px-8 lg:px-12 pt-16 md:pt-20 pb-8 md:pb-12">
          <div className="flex flex-col md:flex-row gap-8 md:gap-12">
            {/* Profile photo block (w-48 h-72 / md:w-64 md:h-96 in PersonHero) */}
            <div className="flex-shrink-0 mx-auto md:mx-0">
              <Skeleton className="w-48 h-72 md:w-64 md:h-96 rounded-2xl" />
            </div>

            {/* Name, department badge, meta row, bio lines */}
            <div className="flex-1 min-w-0 flex flex-col items-center md:items-start">
              <Skeleton className="h-9 lg:h-12 w-64 max-w-full" />
              <Skeleton className="mt-3 h-6 w-20 rounded-full" />
              <Skeleton className="mt-5 h-4 w-72 max-w-full" />
              <div className="mt-7 w-full space-y-2.5">
                <Skeleton className="h-5 w-28" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-2/3" />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* First credits scroller placeholder */}
      <section className="mt-8 space-y-4">
        <div className="px-4 md:px-8 lg:px-12">
          <Skeleton className="h-6 w-40" />
        </div>
        <div className="flex gap-3 px-4 md:px-8 lg:px-12 overflow-hidden">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="flex-shrink-0 w-[130px] sm:w-[145px] md:w-[160px]">
              <Skeleton className="aspect-[2/3] rounded-lg mb-2" />
              <Skeleton className="h-3 w-full mb-1" />
              <Skeleton className="h-2.5 w-1/2" />
            </div>
          ))}
        </div>
      </section>
    </article>
  );
}

// Async page content - everything below depends on getPerson, so it streams in
// behind the Suspense boundary while the skeleton shows.
async function PersonContentAsync({ id }: { id: number }) {
  const person = await getPerson(id);

  if (!person) {
    notFound();
  }

  // Extract only the fields needed by each client component (RSC payload optimization)
  // This reduces ~857KB → ~350KB by removing unused fields like overview from credits
  const heroProps = extractPersonHeroProps(person);
  const knownForCredits = extractKnownForCredits(
    person.combined_credits?.cast,
    person.combined_credits?.crew,
    person.known_for_department,
    15
  );
  const upcomingLatestCredits = extractUpcomingLatestCredits(
    person.combined_credits?.cast,
    person.combined_credits?.crew,
    20, // cast limit
    10 // crew limit
  );
  const filmographyData = {
    id: person.id,
    known_for_department: person.known_for_department,
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

      {/* Update global media context so AI chat prompts use the person's name
          (otherwise the floating pill falls back to "this person") */}
      <MediaContextUpdater mediaType="person" itemId={person.id} title={person.name} />

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

export default async function PersonPage({ params, searchParams }: PersonPageProps) {
  const { params: routeParams } = await params;
  const personId = routeParams[0];
  const id = parseInt(personId, 10);

  if (isNaN(id)) {
    notFound();
  }

  // E2E test trigger: throw an error to test error boundary.
  // The NODE_ENV gate must wrap the `await searchParams` itself — unwrapping
  // searchParams opts the route out of ISR, so production must never touch it.
  if (process.env.NODE_ENV !== "production") {
    const { __e2e_error } = await searchParams;
    if (__e2e_error === "true") {
      throw new Error("E2E Test Error: Simulated error for error boundary testing");
    }
  }

  // In-page Suspense (NOT loading.tsx — that would lock the response to HTTP
  // 200 and break the 404/308 thrown from generateMetadata, see
  // .claude/rules/performance.md): on ISR cache misses the shell + skeleton
  // flush immediately while getPerson resolves.
  return (
    <Suspense fallback={<PersonPageSkeleton />}>
      <PersonContentAsync id={id} />
    </Suspense>
  );
}
