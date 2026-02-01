"use client";

import { useParams } from "next/navigation";
import { useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { CDN_IMAGE_BASE } from "@/lib/constants";

/**
 * Movie page loading skeleton with REAL CDN images
 *
 * Key insight: CDN URLs are deterministic - only need the movie ID
 * Since images are often cached from home/browse pages, they load instantly
 * Only dynamic content (ratings, genres, watch options) shows skeleton
 */
export default function MovieLoading() {
  const params = useParams();
  // Extract movie ID from route params (first segment)
  const movieId = params?.params?.[0] as string | undefined;
  const id = movieId ? parseInt(movieId, 10) : null;

  // If we can't get a valid ID, fall back to full skeleton
  if (!id || isNaN(id)) {
    return <FullSkeleton />;
  }

  return <LoadingWithImages movieId={id} />;
}

// Loading state with real CDN images
function LoadingWithImages({ movieId }: { movieId: number }) {
  const [backdropFailed, setBackdropFailed] = useState(false);
  const [logoFailed, setLogoFailed] = useState(false);

  const backdropUrl = `${CDN_IMAGE_BASE}/movie/${movieId}/backdrop.webp`;
  const logoUrl = `${CDN_IMAGE_BASE}/movie/${movieId}/logo.webp`;

  return (
    <article className="pb-12">
      {/* Hero with REAL CDN images */}
      <section className="relative">
        <div className="hero-container relative w-full overflow-hidden bg-black flex flex-col md:block md:h-full">
          {/* Mobile: Full-width image with natural aspect ratio */}
          <div className="relative w-full aspect-video md:hidden flex-shrink-0">
            {!backdropFailed ? (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={backdropUrl}
                  alt=""
                  className="w-full h-full object-cover object-[center_20%]"
                  onError={() => setBackdropFailed(true)}
                />
                {/* Top gradient for navbar */}
                <div className="absolute inset-x-0 top-0 h-16 bg-linear-to-b from-black/40 to-transparent" />
                {/* Bottom gradient */}
                <div
                  className="absolute inset-x-0 bottom-0 h-24 pointer-events-none"
                  style={{
                    background: `linear-gradient(to top,
                      rgb(0,0,0) 0%,
                      rgba(0,0,0,0.9) 30%,
                      rgba(0,0,0,0.5) 60%,
                      transparent 100%)`,
                  }}
                />
              </>
            ) : (
              <div className="w-full h-full animate-pulse bg-gradient-to-t from-muted/40 via-muted/20 to-transparent" />
            )}
          </div>

          {/* Desktop: Right-aligned backdrop */}
          <div className="absolute inset-0 hidden md:flex justify-end">
            {!backdropFailed ? (
              <div className="relative h-full">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={backdropUrl}
                  alt=""
                  className="h-full w-auto max-w-none"
                  onError={() => setBackdropFailed(true)}
                />
                {/* Left fade gradient */}
                <div
                  className="absolute inset-0 pointer-events-none"
                  style={{
                    background: `linear-gradient(to right,
                      rgba(0,0,0,0.95) 0%,
                      rgba(0,0,0,0.7) 5%,
                      rgba(0,0,0,0.3) 12%,
                      transparent 22%)`,
                  }}
                />
              </div>
            ) : (
              <div className="w-full h-full animate-pulse bg-gradient-to-l from-muted/40 via-muted/20 to-transparent" />
            )}
          </div>

          {/* Desktop gradients */}
          <div className="absolute inset-x-0 top-0 h-16 bg-linear-to-b from-black/25 to-transparent hidden md:block" />
          <div className="absolute inset-x-0 bottom-0 h-[8%] bg-linear-to-t from-background/70 via-background/5 to-transparent hidden md:block" />

          {/* Content overlay */}
          <div className="relative z-10 bg-black px-4 -mt-8 pb-6 md:absolute md:inset-0 md:bg-transparent md:p-0 md:mt-0">
            <div className="flex flex-col items-center text-center md:items-start md:text-left md:absolute md:inset-0 md:flex md:flex-col md:justify-end md:px-8 lg:px-12">
              {/* Logo - real CDN image */}
              <div className="mb-3 md:mb-6 lg:mb-8">
                {!logoFailed ? (
                  <div className="relative">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={logoUrl}
                      alt=""
                      className="object-contain object-left drop-shadow-lg max-w-[260px] sm:max-w-[320px] md:max-w-[500px] lg:max-w-[600px] max-h-[80px] sm:max-h-[100px] md:max-h-[160px] lg:max-h-[180px]"
                      onError={() => setLogoFailed(true)}
                    />
                  </div>
                ) : (
                  <Skeleton className="h-16 sm:h-20 md:h-24 w-64 sm:w-80 md:w-96 bg-white/10" />
                )}
              </div>

              {/* Content skeleton - only these need loading state */}
              <div className="flex flex-col items-center md:items-start gap-2 md:gap-3 pb-2 md:pb-6 lg:pb-8 md:hero-content-width">
                {/* Badges skeleton */}
                <div className="flex gap-2">
                  <Skeleton className="h-6 w-24 rounded-full bg-white/10" />
                  <Skeleton className="h-6 w-28 rounded-full bg-white/10" />
                </div>

                {/* Ratings skeleton */}
                <Skeleton className="h-8 w-52 rounded-full bg-white/10" />

                {/* Watch options skeleton */}
                <div className="flex gap-2">
                  <Skeleton className="h-9 w-28 rounded-lg bg-white/10" />
                  <Skeleton className="h-9 w-28 rounded-lg bg-white/10" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Action bar skeleton */}
      <div className="mt-2 md:mt-3 px-4 md:px-8 lg:px-12">
        <div className="flex gap-3">
          <Skeleton className="h-10 w-32 rounded-lg" />
          <Skeleton className="h-10 w-10 rounded-lg" />
          <Skeleton className="h-10 w-10 rounded-lg" />
          <Skeleton className="h-10 w-10 rounded-lg" />
        </div>
      </div>

      {/* Overview section skeleton */}
      <section className="py-4 md:py-5 px-4 md:px-8 lg:px-12">
        <div className="rounded-xl bg-card/40 border border-white/5 backdrop-blur-sm overflow-hidden">
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_1px_280px] xl:grid-cols-[1fr_1px_320px]">
            <div className="p-5 md:p-6 space-y-4">
              <Skeleton className="h-4 w-20 mb-3" />
              <Skeleton className="h-4 w-full mb-2" />
              <Skeleton className="h-4 w-full mb-2" />
              <Skeleton className="h-4 w-3/4" />
            </div>
            <div className="hidden lg:block bg-white/10" />
            <div className="p-5 md:p-6 space-y-3 border-t lg:border-t-0 border-white/10">
              <Skeleton className="h-4 w-16 mb-4" />
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Skeleton className="h-4 w-16" />
                  <Skeleton className="h-4 w-24" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Cast skeleton */}
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
    </article>
  );
}

// Fallback skeleton when ID is not available
function FullSkeleton() {
  return (
    <article className="pb-12">
      <section className="relative">
        <div className="hero-container relative w-full overflow-hidden bg-black">
          <div className="absolute inset-0 md:left-[18%] lg:left-[25%]">
            <Skeleton className="absolute inset-0 rounded-none" />
          </div>
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
          <div className="absolute inset-0 z-10 flex flex-col justify-end px-4 md:px-8 lg:px-12">
            <div className="hero-content-width pb-5 md:pb-6 lg:pb-8 flex flex-col gap-4">
              <Skeleton className="h-16 sm:h-20 md:h-24 w-64 sm:w-80 md:w-96 bg-white/10" />
              <div className="flex gap-2">
                <Skeleton className="h-6 w-20 rounded-full bg-white/10" />
                <Skeleton className="h-6 w-24 rounded-full bg-white/10" />
              </div>
              <Skeleton className="h-8 w-52 rounded-full bg-white/10" />
            </div>
          </div>
        </div>
      </section>
      <div className="mt-4 md:mt-6 px-4 md:px-8 lg:px-12">
        <div className="flex gap-3">
          <Skeleton className="h-10 w-32 rounded-lg" />
          <Skeleton className="h-10 w-10 rounded-lg" />
          <Skeleton className="h-10 w-10 rounded-lg" />
        </div>
      </div>
    </article>
  );
}
