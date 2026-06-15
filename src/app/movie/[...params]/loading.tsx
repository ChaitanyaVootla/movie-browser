import { Skeleton } from "@/components/ui/skeleton";

/**
 * Route-level loading skeleton → instant client-side navigation.
 *
 * Safe to have ONLY because 404/308 resolution for detail URLs happens in the
 * proxy, pre-render (src/server/proxy/media-resolver.ts). A route with
 * loading.tsx streams a 200 before generateMetadata can throw, so this file
 * must never be added without that proxy authority in place (see
 * .claude/rules/performance.md, "Status codes").
 *
 * Layout mirrors the real page: hero block (mobile: aspect-ratio image area
 * with content below; desktop: ~60dvh-capped .hero-container with content
 * bottom-anchored), then action bar + overview lines. Skeleton bars over the
 * hero use white/10 (allowed over imagery/dark hero base per DESIGN.md).
 */
export default function Loading() {
  return (
    <article className="pb-12">
      {/* Hero — .hero-container handles the height clamp (≤60vh on desktop) */}
      <section className="relative">
        <div className="hero-container relative w-full overflow-hidden">
          {/* Backdrop placeholder: aspect-ratio block on mobile, fill on desktop.
              Carries the shared `hero-backdrop` view-transition-name so the
              detail↔discussions morph has a target during this loading state. */}
          <Skeleton
            className="aspect-video w-full rounded-none md:absolute md:inset-0 md:h-full md:aspect-auto"
            style={{ viewTransitionName: "hero-backdrop" }}
          />

          <div className="relative flex flex-col items-center text-center md:items-start md:text-left md:h-full md:justify-end px-4 md:px-8 lg:px-12 pt-4 md:pt-0 pb-5 md:pb-6 lg:pb-8 gap-2.5 md:gap-3">
            {/* Title/logo placeholder — shared `hero-logo` morph target. */}
            <Skeleton
              className="h-12 w-56 sm:w-64 md:h-20 md:w-96 bg-white/10 mb-1 md:mb-4"
              style={{ viewTransitionName: "hero-logo" }}
            />

            {/* Badges */}
            <div className="flex gap-2">
              <Skeleton className="h-6 w-24 rounded-full bg-white/10" />
              <Skeleton className="h-6 w-28 rounded-full bg-white/10" />
            </div>

            {/* Ratings */}
            <Skeleton className="h-8 w-52 rounded-full bg-white/10" />

            {/* Watch options */}
            <div className="flex gap-2">
              <Skeleton className="h-9 w-28 rounded-lg bg-white/10" />
              <Skeleton className="h-9 w-28 rounded-lg bg-white/10" />
            </div>
          </div>
        </div>
      </section>

      {/* Action bar */}
      <div className="mt-2 md:mt-3 px-4 md:px-8 lg:px-12">
        <div className="flex gap-3">
          <Skeleton className="h-10 w-32 rounded-lg" />
          <Skeleton className="h-10 w-10 rounded-lg" />
          <Skeleton className="h-10 w-10 rounded-lg" />
          <Skeleton className="h-10 w-10 rounded-lg" />
        </div>
      </div>

      {/* Overview lines */}
      <section className="py-4 md:py-5 px-4 md:px-8 lg:px-12">
        <div className="rounded-xl bg-card/40 border border-white/5 backdrop-blur-sm p-5 md:p-6 space-y-3">
          <Skeleton className="h-4 w-20 mb-2" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
        </div>
      </section>
    </article>
  );
}
