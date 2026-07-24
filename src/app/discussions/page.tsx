import type { Metadata } from "next";
import { SITE_URL } from "@/lib/constants";
import { PageMain } from "@/components/features/layout/page-main";
import { SectionHeading } from "@/components/features/layout/section-heading";
import { HubTabs } from "./hub-tabs";
import {
  getHubHotPage,
  getHubNewPage,
  type HubPage,
} from "@/server/db/postgres/social/discussion-hub";
import { dataLogger } from "@/lib/logger";

const EMPTY_HUB: HubPage = { cards: [], nextCursor: null };

export const revalidate = 300; // anon Hot/New cacheable; Following hydrates client-side
export const dynamic = "force-static";

export const metadata: Metadata = {
  // Layout template appends "- Movie Browser" — no brand suffix here
  title: "Discussions",
  description:
    "Hot and new discussion threads across every movie and TV show — spoiler-safe, gated by your watch progress, and never archived. The boards IMDb deleted.",
  alternates: {
    canonical: `${SITE_URL}/discussions`,
  },
};

export default async function DiscussionsHubPage() {
  // Anon-cacheable reads ONLY (spec invariant 1). No auth(), no headers().
  // Fail-open: this is a force-static ISR render, so it prerenders at BUILD time
  // where there is no DB (dummy DATABASE_URL) — an unguarded Prisma throw fails
  // the whole production build (Jun 19 2026). On any DB error render an empty hub;
  // ISR refills it on the next successful revalidation in prod.
  let hot: HubPage = EMPTY_HUB;
  let fresh: HubPage = EMPTY_HUB;
  try {
    [hot, fresh] = await Promise.all([getHubHotPage(), getHubNewPage()]);
  } catch (error) {
    dataLogger.warn(
      { event: "discussions_hub_render_db_unavailable", error: String(error) },
      "discussions hub: DB unavailable during render — serving empty hub"
    );
  }
  return (
    <PageMain>
      <h1 className="sr-only">Movie &amp; TV discussions</h1>
      <SectionHeading>Discussions</SectionHeading>
      <p className="mb-4 max-w-prose text-sm text-muted-foreground">
        Persistent, spoiler-safe discussion across every title. Hot and New are open to all;
        sign in to see discussions from people you follow and shows you track.
      </p>
      <HubTabs initialHot={hot.cards} initialNew={fresh.cards} />
    </PageMain>
  );
}
