"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Sparkles } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { useMobile } from "@/hooks/use-mobile";
import { useHistoryDismiss } from "@/hooks/use-history-dismiss";
import { cn, getMediaPath } from "@/lib/utils";
import { TMDB_IMAGE_BASE } from "@/lib/constants";
import type { FacetStat } from "@/lib/taste/lift";
import { WidgetCard } from "./widget-card";

/** Evidence copy: numbers only, about the titles — never about the person. */
function evidenceLine(f: FacetStat): string {
  const titles = `${f.count} ${f.count === 1 ? "title" : "titles"}`;
  return f.lift >= 1.5 ? `${titles}, ${f.lift.toFixed(1)}× the catalog rate` : titles;
}

function EvidenceGrid({ facet }: { facet: FacetStat }) {
  return (
    <ul className="grid grid-cols-3 gap-2">
      {facet.titles.map((t) => (
        <li key={`${t.mediaType}-${t.tmdbId}`}>
          <Link
            href={getMediaPath(t.mediaType, t.tmdbId, t.title)}
            prefetch={false}
            className="group block rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <div className="relative aspect-[2/3] overflow-hidden rounded-lg bg-muted">
              {t.posterPath && (
                <Image
                  src={`${TMDB_IMAGE_BASE}/w185${t.posterPath}`}
                  alt={t.title}
                  fill
                  unoptimized
                  className="object-cover"
                  sizes="96px"
                />
              )}
            </div>
            <p className="mt-1 line-clamp-1 text-xs font-medium text-muted-foreground group-hover:text-foreground">
              {t.title}
            </p>
          </Link>
        </li>
      ))}
    </ul>
  );
}

/**
 * Moods & themes: lifted AI THEME/VIBE/MOOD tags as chips with counts.
 * Tapping a chip shows the titles behind it — Popover on desktop, Vaul Drawer
 * (with Back-to-dismiss) on mobile, per DESIGN.md → Dialogs vs Drawers. The
 * three strongest tags carry the AI-tag brand tint; the rest stay muted.
 */
export function TasteMoodsWidget({ moods }: { moods: FacetStat[] }) {
  const isMobile = useMobile();
  const [active, setActive] = useState<FacetStat | null>(null);
  const close = () => setActive(null);
  useHistoryDismiss(active !== null && isMobile, close);

  return (
    <WidgetCard title="Moods & themes" icon={<Sparkles className="h-4 w-4" />}>
      <ul className="flex flex-wrap gap-2">
        {moods.map((f, i) => {
          const isActive = active?.key === f.key && active.type === f.type;
          const chip = (
            <button
              type="button"
              // Mobile opens the drawer; desktop is driven by PopoverTrigger.
              onClick={isMobile ? () => setActive(f) : undefined}
              aria-expanded={isActive}
              className={cn(
                "inline-flex min-h-10 items-center gap-1.5 rounded-full px-3 text-xs font-medium transition-colors md:min-h-8",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                i < 3 ? "bg-brand/15 text-brand hover:bg-brand/25" : "bg-muted text-muted-foreground hover:text-foreground",
                isActive && "ring-2 ring-brand/60"
              )}
            >
              <span>{f.label}</span>
              <span className="tabular-nums opacity-70">{f.count}</span>
            </button>
          );
          return (
            <li key={`${f.type}:${f.key}`}>
              {isMobile ? (
                chip
              ) : (
                <Popover open={isActive} onOpenChange={(o) => (o ? setActive(f) : close())}>
                  <PopoverTrigger asChild>{chip}</PopoverTrigger>
                  <PopoverContent align="start" className="w-80 space-y-3">
                    <div>
                      <p className="text-sm font-semibold">{f.label}</p>
                      <p className="text-xs font-medium text-muted-foreground">{evidenceLine(f)}</p>
                    </div>
                    <EvidenceGrid facet={f} />
                  </PopoverContent>
                </Popover>
              )}
            </li>
          );
        })}
      </ul>

      {isMobile && (
        <Drawer open={active !== null} onOpenChange={(o) => !o && close()}>
          <DrawerContent>
            {active && (
              <>
                <DrawerHeader className="text-left">
                  <DrawerTitle>{active.label}</DrawerTitle>
                  <DrawerDescription>{evidenceLine(active)}</DrawerDescription>
                </DrawerHeader>
                <div className="px-4 pb-[calc(env(safe-area-inset-bottom,0px)+1.5rem)]">
                  <EvidenceGrid facet={active} />
                </div>
              </>
            )}
          </DrawerContent>
        </Drawer>
      )}
    </WidgetCard>
  );
}
