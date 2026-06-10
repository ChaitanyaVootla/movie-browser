import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { PageMain } from "@/components/features/layout/page-main";
import { Button } from "@/components/ui/button";
import { HERO_TAGLINE, OVERLINE } from "@/lib/design";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Page Not Found",
  robots: { index: false, follow: false },
};

export default function NotFound() {
  return (
    <PageMain className="flex flex-col items-center justify-center text-center gap-6 min-h-[60dvh]">
      <p className={OVERLINE}>Error 404</p>

      {/* The popcorn mascot stands in for the missing zero. */}
      <div className="group flex items-center justify-center gap-2" aria-hidden="true">
        <span className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight leading-none select-none">
          4
        </span>
        <Image
          src="/popcorn-lite.png"
          alt=""
          width={52}
          height={52}
          className="transition-transform duration-200 group-hover:-rotate-6 group-hover:scale-110"
        />
        <span className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight leading-none select-none">
          4
        </span>
      </div>

      <div className="space-y-3">
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight">
          This scene didn&apos;t make the cut
        </h1>
        <p className="text-sm text-muted-foreground leading-relaxed max-w-md mx-auto">
          The page you&apos;re looking for doesn&apos;t exist, was retitled, or never premiered.
        </p>
      </div>

      <blockquote className={cn(HERO_TAGLINE, "max-w-md")}>
        Every great catalog leaves a few scenes on the cutting room floor.
      </blockquote>

      <div className="flex flex-wrap items-center justify-center gap-3">
        <Button asChild>
          <Link href="/">Back to home</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/browse">Browse titles</Link>
        </Button>
      </div>
    </PageMain>
  );
}
