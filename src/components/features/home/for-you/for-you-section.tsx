"use client";

/**
 * Eager shell for the home For-you island. Guests (most home traffic) get
 * `null` and never download the body: the Tune bar, rec rows, feedback and
 * Cue wiring all live in `for-you-body.tsx`, loaded only once the session is
 * authenticated. The loading state is the same skeleton the body shows while
 * recs fetch, so there is no extra layout shift.
 */
import dynamic from "next/dynamic";
import { Sparkles } from "lucide-react";
import { useSafeSession } from "@/hooks/use-safe-session";
import { MediaCardSkeleton } from "@/components/features/movie/media-card";
import { SectionHeading } from "@/components/features/layout/section-heading";

function ShellSkeleton() {
  return (
    <section className="space-y-4" aria-busy="true" aria-label="Loading recommendations">
      <SectionHeading icon={<Sparkles className="h-5 w-5 text-brand" />}>For you</SectionHeading>
      <div className="flex gap-2 overflow-hidden" aria-hidden>
        {Array.from({ length: 6 }).map((_, i) => (
          <span key={i} className="h-8 w-20 flex-shrink-0 rounded-full bg-muted" />
        ))}
      </div>
      <div className="flex gap-4 overflow-hidden">
        {Array.from({ length: 6 }).map((_, i) => (
          <MediaCardSkeleton
            key={i}
            className="w-[150px] sm:w-[180px] md:w-[200px] flex-shrink-0"
            wideClassName="w-[260px] sm:w-[300px] md:w-[340px] flex-shrink-0"
          />
        ))}
      </div>
    </section>
  );
}

const ForYouBody = dynamic(() => import("./for-you-body"), { ssr: false, loading: ShellSkeleton });

export function ForYouSection() {
  const { status } = useSafeSession();
  if (status !== "authenticated") return null;
  return <ForYouBody />;
}
