import type { Metadata } from "next";
import { PageMain } from "@/components/features/layout/page-main";
import { SectionHeading } from "@/components/features/layout/section-heading";
import { HubTabs } from "./hub-tabs";
import { getHubHotPage, getHubNewPage } from "@/server/db/postgres/social/discussion-hub";

export const revalidate = 300; // anon Hot/New cacheable; Following hydrates client-side
export const dynamic = "force-static";

export const metadata: Metadata = {
  title: "Discussions · The Movie Browser",
  description:
    "Browse what people are talking about across movies and TV — the discussion boards IMDb deleted.",
};

export default async function DiscussionsHubPage() {
  // Anon-cacheable reads ONLY (spec invariant 1). No auth(), no headers().
  const [hot, fresh] = await Promise.all([getHubHotPage(), getHubNewPage()]);
  return (
    <PageMain>
      <SectionHeading>Discussions</SectionHeading>
      <p className="mb-4 max-w-prose text-sm text-muted-foreground">
        Persistent, spoiler-safe discussion across every title. Hot and New are open to all;
        sign in to see discussions from people you follow and shows you track.
      </p>
      <HubTabs initialHot={hot.cards} initialNew={fresh.cards} />
    </PageMain>
  );
}
