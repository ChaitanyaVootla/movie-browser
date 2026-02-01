import { Skeleton } from "@/components/ui/skeleton";

/**
 * Person page loading skeleton
 * Shows immediately when navigating to a person detail page
 * Matches the layout of PersonHero + sections for smooth transitions
 */
export default function PersonLoading() {
  return (
    <article className="pb-12">
      {/* Hero Section Skeleton - matches PersonHero layout */}
      <section className="relative bg-gradient-to-b from-background/50 to-background">
        <div className="px-4 md:px-8 lg:px-12 pt-16 md:pt-20 pb-8 md:pb-12">
          <div className="flex flex-col md:flex-row gap-8 md:gap-12">
            {/* Profile Image Skeleton */}
            <div className="flex-shrink-0 mx-auto md:mx-0">
              <Skeleton className="w-48 h-72 md:w-64 md:h-96 rounded-2xl" />
            </div>

            {/* Info Section Skeleton */}
            <div className="flex-1 min-w-0">
              {/* Name */}
              <Skeleton className="h-10 md:h-12 lg:h-14 w-64 md:w-80 mx-auto md:mx-0" />

              {/* Known For Department Badge */}
              <div className="mt-2 flex justify-center md:justify-start">
                <Skeleton className="h-6 w-20 rounded-full" />
              </div>

              {/* Meta Info (birth, location, popularity) */}
              <div className="mt-4 flex flex-wrap items-center justify-center md:justify-start gap-x-4 gap-y-2">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-4 w-24" />
              </div>

              {/* External Links */}
              <div className="mt-4 flex flex-wrap items-center justify-center md:justify-start gap-2">
                <Skeleton className="h-9 w-24 rounded-md" />
                <Skeleton className="h-9 w-20 rounded-md" />
                <Skeleton className="h-9 w-16 rounded-md" />
              </div>

              {/* Biography */}
              <div className="mt-6">
                <Skeleton className="h-5 w-24 mb-2" />
                <div className="space-y-2">
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-3/4" />
                </div>
              </div>

              {/* Also Known As */}
              <div className="mt-4">
                <Skeleton className="h-4 w-28 mb-1.5" />
                <Skeleton className="h-3 w-64" />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Upcoming & Latest Section Skeleton */}
      <section className="mt-8 space-y-4">
        <div className="px-4 md:px-8 lg:px-12 flex items-center gap-2">
          <Skeleton className="h-5 w-5 rounded" />
          <Skeleton className="h-6 w-40" />
        </div>
        <div className="flex gap-4 px-4 md:px-8 lg:px-12 overflow-hidden">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex-shrink-0 w-[140px] sm:w-[160px] md:w-[180px]">
              <Skeleton className="aspect-[2/3] rounded-lg mb-2" />
              <Skeleton className="h-4 w-full mb-1" />
              <Skeleton className="h-3 w-3/4" />
            </div>
          ))}
        </div>
      </section>

      {/* Known For Section Skeleton */}
      <section className="mt-8 space-y-4">
        <div className="px-4 md:px-8 lg:px-12 flex items-center gap-2">
          <Skeleton className="h-5 w-5 rounded" />
          <Skeleton className="h-6 w-24" />
        </div>
        <div className="flex gap-4 px-4 md:px-8 lg:px-12 overflow-hidden">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="flex-shrink-0 w-[140px] sm:w-[160px] md:w-[180px]">
              <Skeleton className="aspect-[2/3] rounded-lg mb-2" />
              <Skeleton className="h-4 w-full mb-1" />
              <Skeleton className="h-3 w-2/3" />
            </div>
          ))}
        </div>
      </section>

      {/* Photo Gallery Section Skeleton */}
      <section className="mt-8 space-y-4">
        <div className="px-4 md:px-8 lg:px-12 flex items-center gap-2">
          <Skeleton className="h-5 w-5 rounded" />
          <Skeleton className="h-6 w-20" />
        </div>
        <div className="flex gap-4 px-4 md:px-8 lg:px-12 overflow-hidden">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="flex-shrink-0 w-24 h-36 rounded-lg" />
          ))}
        </div>
      </section>

      {/* Filmography Section Skeleton */}
      <section className="mt-8 space-y-4">
        <div className="px-4 md:px-8 lg:px-12 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Skeleton className="h-5 w-5 rounded" />
            <Skeleton className="h-6 w-28" />
          </div>
          {/* Filter tabs */}
          <div className="flex gap-2">
            <Skeleton className="h-8 w-16 rounded-md" />
            <Skeleton className="h-8 w-20 rounded-md" />
          </div>
        </div>

        {/* Decade groups */}
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="px-4 md:px-8 lg:px-12">
            <Skeleton className="h-5 w-16 mb-3" />
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
              {Array.from({ length: 6 }).map((_, j) => (
                <div key={j}>
                  <Skeleton className="aspect-[2/3] rounded-lg mb-2" />
                  <Skeleton className="h-3 w-full mb-1" />
                  <Skeleton className="h-2.5 w-1/2" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </section>
    </article>
  );
}
