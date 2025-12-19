import { Metadata } from "next";
import { notFound } from "next/navigation";
import { SITE_NAME, SITE_URL } from "@/lib/constants";
import {
  getTopicByKey,
  getTopicMetaFromKey,
  ALL_TOPICS,
  THEME_DEFINITIONS,
} from "@/lib/topics";
import { discoverBatch } from "@/server/actions/discover";
import type { DiscoverParams } from "@/lib/discover";
import { TopicDetailClient } from "./client";

interface TopicPageProps {
  params: Promise<{
    topic: string;
  }>;
}

// Generate static params for pre-rendering popular topics
export async function generateStaticParams() {
  // Pre-render the first 50 topics
  return ALL_TOPICS.slice(0, 50).map((topic) => ({
    topic: topic.key,
  }));
}

// Generate metadata dynamically
export async function generateMetadata({
  params,
}: TopicPageProps): Promise<Metadata> {
  const { topic: topicKey } = await params;
  const decodedKey = decodeURIComponent(topicKey);

  // Try to find in pre-defined topics first
  let topic = getTopicByKey(decodedKey);

  // If not found, try to parse and generate
  if (!topic) {
    topic = getTopicMetaFromKey(decodedKey, THEME_DEFINITIONS);
  }

  if (!topic) {
    return {
      title: `Topic Not Found | ${SITE_NAME}`,
    };
  }

  const description = `Discover the best ${topic.name.toLowerCase()}. Browse and filter through our curated collection.`;

  return {
    title: `${topic.name} | ${SITE_NAME}`,
    description,
    openGraph: {
      title: `${topic.name} | ${SITE_NAME}`,
      description,
      url: `${SITE_URL}/topics/${topicKey}`,
      siteName: SITE_NAME,
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title: `${topic.name} | ${SITE_NAME}`,
      description,
    },
    alternates: {
      canonical: `${SITE_URL}/topics/${topicKey}`,
    },
  };
}

export default async function TopicPage({ params }: TopicPageProps) {
  const { topic: topicKey } = await params;
  const decodedKey = decodeURIComponent(topicKey);

  // Try to find in pre-defined topics first
  let topic = getTopicByKey(decodedKey);

  // If not found, try to parse and generate dynamically
  if (!topic) {
    topic = getTopicMetaFromKey(decodedKey, THEME_DEFINITIONS);
  }

  if (!topic) {
    notFound();
  }

  // Fetch initial results for the main topic
  const mainParams = topic.filterParams as Partial<DiscoverParams> & {
    media_type: "movie" | "tv";
  };
  
  const initialResult = await discoverBatch(mainParams, 2);

  // Fetch preview data for scroll variations (if any)
  const variationPreviews: Record<string, typeof initialResult.results> = {};

  if (topic.scrollVariations && topic.scrollVariations.length > 0) {
    const variationResults = await Promise.all(
      topic.scrollVariations.slice(0, 6).map(async (variation: { key: string; name: string; filterParams: Partial<DiscoverParams> }) => {
        try {
          const params = {
            ...mainParams,
            ...variation.filterParams,
          } as Partial<DiscoverParams> & { media_type: "movie" | "tv" };
          
          const result = await discoverBatch(params, 1);
          return { key: variation.key, results: result.results.slice(0, 15) };
        } catch {
          return { key: variation.key, results: [] };
        }
      })
    );

    variationResults.forEach(({ key, results }: { key: string; results: typeof initialResult.results }) => {
      variationPreviews[key] = results;
    });
  }

  return (
    <TopicDetailClient
      topic={topic}
      initialResults={initialResult.results}
      totalPages={initialResult.totalPages}
      totalResults={initialResult.totalResults}
      variationPreviews={variationPreviews}
    />
  );
}

