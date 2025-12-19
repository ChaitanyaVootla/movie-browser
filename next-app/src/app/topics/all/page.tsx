import { Metadata } from "next";
import Link from "next/link";
import { Film, Tv, ArrowLeft } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { SITE_NAME, SITE_URL } from "@/lib/constants";
import { ALL_TOPICS, GENRE_TOPICS, THEME_TOPICS } from "@/lib/topics";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: `All Topics | ${SITE_NAME}`,
  description:
    "Browse all movie and TV show topics. Find content by genre, theme, language, and more.",
  openGraph: {
    title: `All Topics | ${SITE_NAME}`,
    description:
      "Browse all movie and TV show topics. Find content by genre, theme, language, and more.",
    url: `${SITE_URL}/topics/all`,
    siteName: SITE_NAME,
    type: "website",
  },
  alternates: {
    canonical: `${SITE_URL}/topics/all`,
  },
};

export default function AllTopicsPage() {
  // Group topics by type
  const movieGenres = GENRE_TOPICS.filter((t) => t.filterParams.media_type === "movie");
  const tvGenres = GENRE_TOPICS.filter((t) => t.filterParams.media_type === "tv");
  const movieThemes = THEME_TOPICS.filter((t) => t.filterParams.media_type === "movie");
  const tvThemes = THEME_TOPICS.filter((t) => t.filterParams.media_type === "tv");

  return (
    <div className="min-h-screen pt-14 px-4 md:px-8 lg:px-12 py-6">
      {/* Header */}
      <div className="mb-8">
        <Link
          href="/topics"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-4"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Topics
        </Link>
        <h1 className="text-2xl md:text-3xl font-bold">All Topics</h1>
        <p className="text-muted-foreground mt-1">
          {ALL_TOPICS.length} topics available
        </p>
      </div>

      {/* Movie Genres */}
      <section className="mb-10">
        <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <Film className="h-5 w-5 text-amber-500" />
          Movie Genres
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
          {movieGenres.map((topic) => (
            <TopicCard key={topic.key} topic={topic} />
          ))}
        </div>
      </section>

      {/* TV Genres */}
      <section className="mb-10">
        <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <Tv className="h-5 w-5 text-blue-500" />
          TV Show Genres
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
          {tvGenres.map((topic) => (
            <TopicCard key={topic.key} topic={topic} />
          ))}
        </div>
      </section>

      {/* Movie Themes */}
      <section className="mb-10">
        <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <Film className="h-5 w-5 text-amber-500" />
          Movie Themes
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
          {movieThemes.map((topic) => (
            <TopicCard key={topic.key} topic={topic} />
          ))}
        </div>
      </section>

      {/* TV Themes */}
      <section className="mb-10">
        <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <Tv className="h-5 w-5 text-blue-500" />
          TV Show Themes
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
          {tvThemes.map((topic) => (
            <TopicCard key={topic.key} topic={topic} />
          ))}
        </div>
      </section>
    </div>
  );
}

function TopicCard({ topic }: { topic: (typeof ALL_TOPICS)[0] }) {
  const mediaType = topic.filterParams.media_type as "movie" | "tv";

  return (
    <Link
      href={`/topics/${topic.key}`}
      className={cn(
        "group flex items-center gap-2 p-3 rounded-lg border transition-all",
        "hover:bg-muted/50 hover:border-foreground/20",
        mediaType === "tv"
          ? "border-blue-500/20 hover:border-blue-500/40"
          : "border-amber-500/20 hover:border-amber-500/40"
      )}
    >
      <div
        className={cn(
          "flex-shrink-0 w-8 h-8 rounded-md flex items-center justify-center",
          mediaType === "tv" ? "bg-blue-500/10" : "bg-amber-500/10"
        )}
      >
        {mediaType === "tv" ? (
          <Tv className="h-4 w-4 text-blue-500" />
        ) : (
          <Film className="h-4 w-4 text-amber-500" />
        )}
      </div>
      <span className="text-sm font-medium truncate group-hover:text-foreground">
        {topic.name}
      </span>
    </Link>
  );
}

