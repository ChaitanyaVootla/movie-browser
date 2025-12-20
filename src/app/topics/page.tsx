import { Metadata } from "next";
import { SITE_NAME, SITE_URL } from "@/lib/constants";
import { TopicsClient } from "./client";
import { ALL_TOPICS, GENRE_TOPICS, THEME_TOPICS } from "@/lib/topics";
import { discoverBatch } from "@/server/actions/discover";
import type { DiscoverParams } from "@/lib/discover";
import type { MediaItem } from "@/types";

// ISR: Revalidate every 30 minutes (matches discover cache TTL)
export const revalidate = 1800;

export const metadata: Metadata = {
  title: `Topics | ${SITE_NAME}`,
  description:
    "Explore curated movie and TV show collections by genre, theme, language, and more.",
  openGraph: {
    title: `Topics | ${SITE_NAME}`,
    description:
      "Explore curated movie and TV show collections by genre, theme, language, and more.",
    url: `${SITE_URL}/topics`,
    siteName: SITE_NAME,
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: `Topics | ${SITE_NAME}`,
    description:
      "Explore curated movie and TV show collections by genre, theme, language, and more.",
  },
  alternates: {
    canonical: `${SITE_URL}/topics`,
  },
};

// Pre-fetch initial data for the first few topics
// Reduced to 6 topics to minimize initial load time
async function getTopicPreviews() {
  const topicsToPreload = ALL_TOPICS.slice(0, 6);

  const previews = await Promise.all(
    topicsToPreload.map(async (topic) => {
      try {
        const result = await discoverBatch(
          topic.filterParams as Partial<DiscoverParams> & { media_type: "movie" | "tv" },
          1
        );
        return {
          key: topic.key,
          results: result.results.slice(0, 10),
        };
      } catch (error) {
        console.error(`Failed to fetch preview for ${topic.key}:`, error);
        return { key: topic.key, results: [] };
      }
    })
  );

  return previews.reduce(
    (acc, { key, results }) => {
      acc[key] = results;
      return acc;
    },
    {} as Record<string, MediaItem[]>
  );
}

export default async function TopicsPage() {
  const topicPreviews = await getTopicPreviews();

  return (
    <TopicsClient
      genreTopics={GENRE_TOPICS}
      themeTopics={THEME_TOPICS}
      allTopics={ALL_TOPICS}
      topicPreviews={topicPreviews}
    />
  );
}

