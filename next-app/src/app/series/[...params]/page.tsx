import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Script from "next/script";
import { getSeries } from "@/server/actions/series";
import {
  MediaHero,
  MediaOverview,
  VideoGallery,
  ImageGallery,
  RecommendationsSection,
  RecentTracker,
} from "@/components/features/media";
import { SeasonSelector, EpisodeInfoSection } from "@/components/features/series";
import { SITE_URL, TMDB_IMAGE_BASE } from "@/lib/constants";

interface SeriesPageProps {
  params: Promise<{
    params: string[]; // [seriesId] or [seriesId, slug]
  }>;
}

// Generate SEO metadata
export async function generateMetadata({ params }: SeriesPageProps): Promise<Metadata> {
  const { params: routeParams } = await params;
  const seriesId = routeParams[0];
  const id = parseInt(seriesId, 10);

  if (isNaN(id)) {
    return { title: "Series Not Found" };
  }

  const series = await getSeries(id);

  if (!series) {
    return { title: "Series Not Found" };
  }

  const year = series.first_air_date?.split("-")[0];
  const title = year ? `${series.name} (${year})` : series.name;
  const description =
    series.overview?.slice(0, 160) ||
    `Watch ${series.name} - details, cast, ratings and where to stream.`;
  const backdropUrl = series.backdrop_path
    ? `${TMDB_IMAGE_BASE}/w1280${series.backdrop_path}`
    : undefined;
  const posterUrl = series.poster_path
    ? `${TMDB_IMAGE_BASE}/w500${series.poster_path}`
    : undefined;

  return {
    title,
    description,
    keywords: [
      series.name,
      ...(series.genres?.map((g) => g.name) || []),
      "tv show",
      "series",
      "watch",
      "streaming",
      year,
    ].filter(Boolean) as string[],
    openGraph: {
      type: "video.tv_show",
      title: series.name,
      description: series.overview,
      url: `${SITE_URL}/series/${series.id}`,
      images: backdropUrl
        ? [
            {
              url: backdropUrl,
              width: 1280,
              height: 720,
              alt: `${series.name} backdrop`,
            },
          ]
        : posterUrl
          ? [
              {
                url: posterUrl,
                width: 500,
                height: 750,
                alt: `${series.name} poster`,
              },
            ]
          : [],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: backdropUrl ? [backdropUrl] : posterUrl ? [posterUrl] : [],
    },
    alternates: {
      canonical: `${SITE_URL}/series/${series.id}`,
    },
  };
}

// JSON-LD structured data for SEO
function SeriesSchema({
  series,
}: {
  series: NonNullable<Awaited<ReturnType<typeof getSeries>>>;
}) {
  const creators =
    series.credits?.crew?.filter((c) => c.job === "Creator") || [];
  const actors = series.credits?.cast?.slice(0, 5) || [];

  const schema = {
    "@context": "https://schema.org",
    "@type": "TVSeries",
    name: series.name,
    description: series.overview,
    datePublished: series.first_air_date,
    image: series.poster_path
      ? `${TMDB_IMAGE_BASE}/w500${series.poster_path}`
      : undefined,
    aggregateRating:
      series.vote_average && series.vote_count
        ? {
            "@type": "AggregateRating",
            ratingValue: series.vote_average.toFixed(1),
            ratingCount: series.vote_count,
            bestRating: 10,
            worstRating: 0,
          }
        : undefined,
    genre: series.genres?.map((g) => g.name),
    numberOfSeasons: series.number_of_seasons,
    numberOfEpisodes: series.number_of_episodes,
    creator: creators.map((c) => ({
      "@type": "Person",
      name: c.name,
    })),
    actor: actors.map((a) => ({
      "@type": "Person",
      name: a.name,
    })),
    productionCompany: series.production_companies?.slice(0, 3).map((c) => ({
      "@type": "Organization",
      name: c.name,
    })),
    containsSeason: series.seasons?.map((s) => ({
      "@type": "TVSeason",
      seasonNumber: s.season_number,
      numberOfEpisodes: s.episode_count,
      name: s.name,
    })),
  };

  return (
    <Script
      id="series-schema"
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
    />
  );
}

export default async function SeriesPage({ params }: SeriesPageProps) {
  const { params: routeParams } = await params;
  const seriesId = routeParams[0];
  const id = parseInt(seriesId, 10);

  if (isNaN(id)) {
    notFound();
  }

  const series = await getSeries(id);

  if (!series) {
    notFound();
  }

  // Get YouTube videos
  const youtubeVideos = series.videos?.results?.filter((v) => v.site === "YouTube") || [];

  // Filter out specials from seasons for display
  const displaySeasons = series.seasons?.filter((s) => s.season_number >= 0) || [];

  return (
    <>
      <SeriesSchema series={series} />

      {/* Track this page view for recents */}
      <RecentTracker
        itemId={series.id}
        isMovie={false}
        name={series.name}
        poster_path={series.poster_path}
        backdrop_path={series.backdrop_path}
      />

      <article className="pb-12">
        {/* Hero section with backdrop, logo, genres, ratings, actions */}
        <MediaHero item={series} mediaType="series" />

        {/* Season & Episode Selector */}
        {displaySeasons.length > 0 && (
          <SeasonSelector
            seriesId={series.id}
            seriesName={series.name}
            seasons={displaySeasons}
            className="mt-6 md:mt-8"
          />
        )}

        {/* Next/Last Episode Info */}
        <EpisodeInfoSection
          nextEpisode={series.next_episode_to_air}
          lastEpisode={series.last_episode_to_air}
          seriesName={series.name}
          className="mt-8 md:mt-10"
        />

        {/* Overview, cast, and details */}
        <MediaOverview item={series} mediaType="series" />

        {/* Video Gallery */}
        {youtubeVideos.length > 0 && (
          <VideoGallery videos={youtubeVideos} className="mt-8 md:mt-12" />
        )}

        {/* Image Gallery */}
        {series.images?.backdrops && series.images.backdrops.length > 0 && (
          <ImageGallery
            images={series.images.backdrops}
            title="Gallery"
            className="mt-8 md:mt-12"
          />
        )}

        {/* Recommendations & Similar */}
        <RecommendationsSection
          recommendations={series.recommendations?.results}
          similar={series.similar?.results}
          mediaType="series"
          className="mt-8 md:mt-12"
        />
      </article>
    </>
  );
}

