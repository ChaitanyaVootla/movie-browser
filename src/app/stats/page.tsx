import type { Metadata } from "next";
import Link from "next/link";
import { BarChart3 } from "lucide-react";
import { auth } from "@/lib/auth";
import { getUserStats } from "@/server/actions/tracking";
import { PageMain } from "@/components/features/layout/page-main";
import { SectionHeading } from "@/components/features/layout/section-heading";
import { SignInButton } from "@/components/features/auth";
import { Button } from "@/components/ui/button";
import { StatTiles } from "@/components/features/stats/stat-tiles";
import { BreakdownBars, MonthlyBarChart } from "@/components/features/stats/bar-charts";
import { TopPeopleRow } from "@/components/features/stats/top-people-row";
import { RewatchChampions, StreaksRow } from "@/components/features/stats/rewatch-champions";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
  // Layout template appends "- Movie Browser" — no brand suffix here
  title: "Stats",
  description: "Your watching stats: hours, genres, streaks and more — free.",
};

export default async function StatsPage() {
  const session = await auth();

  if (!session?.user) {
    return (
      <PageMain>
        <div className="mx-auto flex min-h-[50dvh] max-w-md flex-col items-center justify-center gap-3 text-center">
          <BarChart3 className="h-8 w-8 text-muted-foreground" />
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Stats</h1>
          <p className="text-sm text-muted-foreground">
            Sign in and log what you watch — every stat here is free.
          </p>
          <SignInButton message="Sign in to see your watching stats" className="mt-1" />
        </div>
      </PageMain>
    );
  }

  const stats = await getUserStats();
  const hasActivity = stats.moviesWatched > 0 || stats.episodesWatched > 0;

  return (
    <PageMain>
      <div className="mx-auto w-full max-w-3xl space-y-8 md:space-y-10">
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Stats</h1>

        <StatTiles
          tiles={[
            { label: "Hours watched", value: stats.totalHours.toLocaleString() },
            { label: "Films", value: stats.moviesWatched.toLocaleString() },
            { label: "Episodes", value: stats.episodesWatched.toLocaleString() },
            { label: "Series completed", value: stats.seriesCompleted.toLocaleString() },
          ]}
        />

        {!hasActivity ? (
          <div className="rounded-xl border border-dashed bg-card/50 px-4 py-10 text-center">
            <BarChart3 className="mx-auto mb-3 h-8 w-8 text-muted-foreground/60" />
            <p className="mx-auto max-w-sm text-sm text-muted-foreground">
              Your taste breakdown, streaks and most-watched people appear here once you
              start logging. Mark a few films watched to get going.
            </p>
            <Button asChild className="mt-4">
              <Link href="/browse">Find something to watch</Link>
            </Button>
          </div>
        ) : (
          <>
        <section className="space-y-4">
          <SectionHeading>Last 12 months</SectionHeading>
          <MonthlyBarChart data={stats.monthlyCounts} />
        </section>

        <section className="space-y-4">
          <SectionHeading>Taste breakdown</SectionHeading>
          <div className="grid gap-6 md:grid-cols-3">
            <div>
              <p className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3">
                Genres
              </p>
              <BreakdownBars data={stats.genres.slice(0, 8)} />
            </div>
            <div>
              <p className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3">
                Decades
              </p>
              <BreakdownBars data={stats.decades.slice(0, 8)} />
            </div>
            {stats.countries.length > 0 && (
              <div>
                <p className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3">
                  Countries
                </p>
                <BreakdownBars data={stats.countries.slice(0, 8)} />
              </div>
            )}
          </div>
        </section>

        <section className="space-y-4">
          <SectionHeading>Most watched actors</SectionHeading>
          <TopPeopleRow people={stats.topActors} />
        </section>

        <section className="space-y-4">
          <SectionHeading>Most watched directors</SectionHeading>
          <TopPeopleRow people={stats.topDirectors} />
        </section>

        <section className="space-y-4">
          <SectionHeading>Streaks</SectionHeading>
          <StreaksRow current={stats.currentStreakDays} longest={stats.longestStreakDays} />
        </section>

        <section className="space-y-4">
          <SectionHeading>Rewatch champions</SectionHeading>
          <RewatchChampions champions={stats.rewatchChampions} />
        </section>
          </>
        )}
      </div>
    </PageMain>
  );
}
