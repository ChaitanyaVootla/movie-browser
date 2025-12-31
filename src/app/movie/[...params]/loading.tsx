import { Skeleton } from "@/components/ui/skeleton";

/**
 * Movie page loading skeleton
 * Shows immediately when navigating to a movie detail page
 * Matches the layout of the actual page for smooth transitions
 */
export default function MovieLoading() {
  return (
    <article className="pb-12">
      {/* Hero Skeleton - matches hero-container height */}
      <section className="relative">
        <div className="hero-container relative w-full overflow-hidden bg-black">
          {/* Backdrop skeleton - subtle shimmer */}
          <div className="absolute inset-0 md:left-[18%] lg:left-[25%]">
            <Skeleton className="absolute inset-0 rounded-none" />
          </div>
          
          {/* Left fade gradient overlay */}
          <div 
            className="absolute inset-y-0 left-0 w-[50%] md:w-[40%] lg:w-[35%] pointer-events-none"
            style={{
              background: `linear-gradient(to right, 
                black 0%, 
                rgba(0,0,0,0.95) 20%,
                rgba(0,0,0,0.8) 40%,
                rgba(0,0,0,0.5) 60%, 
                rgba(0,0,0,0.2) 80%,
                transparent 100%)`,
            }}
          />

          {/* Hero content skeleton */}
          <div className="absolute inset-0 z-10 flex flex-col justify-end px-4 md:px-8 lg:px-12">
            <div className="hero-content-width pb-5 md:pb-6 lg:pb-8 flex flex-col gap-4">
              {/* Logo skeleton */}
              <Skeleton className="h-16 sm:h-20 md:h-24 w-64 sm:w-80 md:w-96 bg-white/10" />
              
              {/* Genres skeleton */}
              <div className="flex gap-2">
                <Skeleton className="h-6 w-20 rounded-full bg-white/10" />
                <Skeleton className="h-6 w-24 rounded-full bg-white/10" />
                <Skeleton className="h-6 w-16 rounded-full bg-white/10" />
              </div>
              
              {/* Ratings skeleton */}
              <div className="flex gap-4">
                <Skeleton className="h-8 w-16 rounded bg-white/10" />
                <Skeleton className="h-8 w-16 rounded bg-white/10" />
                <Skeleton className="h-8 w-16 rounded bg-white/10" />
              </div>
              
              {/* Watch options skeleton */}
              <div className="flex gap-2">
                <Skeleton className="h-9 w-28 rounded-lg bg-white/10" />
                <Skeleton className="h-9 w-28 rounded-lg bg-white/10" />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Action bar skeleton */}
      <div className="mt-4 md:mt-6 px-4 md:px-8 lg:px-12">
        <div className="flex gap-3">
          <Skeleton className="h-10 w-32 rounded-lg" />
          <Skeleton className="h-10 w-10 rounded-lg" />
          <Skeleton className="h-10 w-10 rounded-lg" />
          <Skeleton className="h-10 w-10 rounded-lg" />
        </div>
      </div>

      {/* Overview section skeleton */}
      <section className="py-8 md:py-12 px-4 md:px-8 lg:px-12">
        <div className="rounded-xl bg-card/40 border border-white/5 backdrop-blur-sm overflow-hidden">
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_1px_280px] xl:grid-cols-[1fr_1px_320px]">
            {/* Main content */}
            <div className="p-5 md:p-6 space-y-4">
              <div>
                <Skeleton className="h-4 w-20 mb-3" />
                <Skeleton className="h-4 w-full mb-2" />
                <Skeleton className="h-4 w-full mb-2" />
                <Skeleton className="h-4 w-3/4" />
              </div>
              
              {/* Keywords skeleton */}
              <div className="flex flex-wrap gap-2 pt-2">
                {Array.from({ length: 6 }).map((_, i) => (
                  <Skeleton key={i} className="h-6 w-16 rounded-full" />
                ))}
              </div>
            </div>

            {/* Separator */}
            <div className="hidden lg:block bg-white/10" />

            {/* Sidebar */}
            <div className="p-5 md:p-6 space-y-3 border-t lg:border-t-0 border-white/10">
              <Skeleton className="h-4 w-16 mb-4" />
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Skeleton className="h-4 w-16" />
                  <Skeleton className="h-4 w-24" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Cast section skeleton */}
      <section className="space-y-4">
        <div className="px-4 md:px-8 lg:px-12 flex items-center gap-2">
          <Skeleton className="h-5 w-5 rounded" />
          <Skeleton className="h-6 w-24" />
        </div>
        <div className="flex gap-4 px-4 md:px-8 lg:px-12 overflow-hidden">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="flex-shrink-0 w-[90px] sm:w-[100px] md:w-[110px]">
              <Skeleton className="aspect-[2/3] rounded-lg mb-1.5" />
              <Skeleton className="h-3 w-full mb-1" />
              <Skeleton className="h-2.5 w-3/4" />
            </div>
          ))}
        </div>
      </section>

      {/* Videos section skeleton */}
      <section className="mt-8 md:mt-12 space-y-4">
        <div className="px-4 md:px-8 lg:px-12 flex items-center gap-2">
          <Skeleton className="h-5 w-5 rounded" />
          <Skeleton className="h-6 w-32" />
        </div>
        <div className="flex gap-4 px-4 md:px-8 lg:px-12 overflow-hidden">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="flex-shrink-0 aspect-video w-[280px] sm:w-[320px] md:w-[360px] rounded-lg" />
          ))}
        </div>
      </section>

      {/* Recommendations skeleton */}
      <section className="mt-8 md:mt-12 space-y-4">
        <div className="px-4 md:px-8 lg:px-12 flex items-center gap-2">
          <Skeleton className="h-5 w-5 rounded" />
          <Skeleton className="h-6 w-28" />
        </div>
        <div className="flex gap-4 px-4 md:px-8 lg:px-12 overflow-hidden">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex-shrink-0 w-[140px] sm:w-[160px] md:w-[180px]">
              <Skeleton className="aspect-[2/3] rounded-lg mb-2" />
              <Skeleton className="h-4 w-full" />
            </div>
          ))}
        </div>
      </section>
    </article>
  );
}

