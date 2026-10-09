"use client";

import Link from "next/link";
import { Check, ListChecks } from "lucide-react";
import { cn } from "@/lib/utils";
import { useUserStore, selectSeriesProgress } from "@/stores/user";
import { COMPACT_ACTIVE, COMPACT_BTN, COMPACT_IDLE } from "./styles";

/**
 * Series "watched" in the compact TitleActions. A series is not marked watched
 * with one tap. On the detail page it is a watch POSITION (SeriesProgressInline
 * + SetPositionSheet), which needs the season list that a preview doesn't
 * have. So the compact slot shows the viewer's progress (%, or a check when
 * complete) and links to the detail page, where the position control lives.
 * Same semantics as the detail page, with no second, divergent writer.
 */
export function SeriesProgressPill({ seriesId, href }: { seriesId: number; href: string }) {
  const progress = useUserStore(selectSeriesProgress(seriesId));
  const complete = !!progress && progress.total != null && progress.watched >= progress.total;
  const tracked = !!progress && (progress.pct > 0 || complete);

  const label = complete
    ? "Watched all episodes — open to update your position"
    : tracked
      ? `${progress?.pct}% watched — open to update your position`
      : "Track your watch position";

  return (
    <Link
      href={href}
      prefetch={false}
      aria-label={label}
      title={label}
      className={cn(COMPACT_BTN, tracked ? COMPACT_ACTIVE : COMPACT_IDLE)}
    >
      {complete ? (
        <Check className="h-4 w-4 stroke-[2.5]" />
      ) : (
        <ListChecks className="h-4 w-4" />
      )}
      {tracked && !complete && <span>{progress?.pct}%</span>}
    </Link>
  );
}
