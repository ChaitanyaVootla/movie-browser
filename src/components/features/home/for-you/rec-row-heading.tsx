"use client";

/**
 * Rec row headings (spec §3.1). because: overlapped poster thumbs of the
 * heading SET (the plural reads before the text) + "Because you loved A, B & C"
 * (mobile: "A & 2 more"); the thumbs open the row-level Why sheet. seed:
 * "More like {seed}" with its thumb. for_you: "For you" + a sub-line.
 */
import Image from "next/image";
import { Sparkles } from "lucide-react";
import { forwardRef } from "react";
import { SectionHeading } from "@/components/features/layout/section-heading";
import { TMDB_IMAGE_BASE } from "@/lib/constants";
import type { RecRowDTO, RecThumbRef } from "@/lib/taste/recommend-types";
import { headingTitles, joinTitles, refKey } from "./rec-copy";

function Thumb({ a, first }: { a: RecThumbRef; first: boolean }) {
  const src = a.posterPath ? `${TMDB_IMAGE_BASE}/w92${a.posterPath}` : null;
  return (
    <span
      className={`relative block h-8 w-[22px] flex-shrink-0 overflow-hidden rounded-md bg-muted ring-2 ring-background ${first ? "" : "-ml-2"}`}
    >
      {src && <Image src={src} alt="" fill sizes="22px" className="object-cover" unoptimized />}
    </span>
  );
}

export const ThumbStack = forwardRef<HTMLButtonElement, { anchors: readonly RecThumbRef[]; onOpen?: () => void; label: string }>(
  function ThumbStack({ anchors, onOpen, label }, ref) {
    const thumbs = (
      <span className="flex items-center">
        {anchors.map((a, i) => (
          <Thumb key={refKey(a)} a={a} first={i === 0} />
        ))}
      </span>
    );
    if (!onOpen) return thumbs;
    return (
      <button
        ref={ref}
        type="button"
        onClick={onOpen}
        aria-label={label}
        className="-m-1 flex min-h-10 flex-shrink-0 items-center rounded-md p-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {thumbs}
      </button>
    );
  }
);

export function BecauseHeading({
  row,
  onOpenRow,
  thumbsRef,
}: {
  row: RecRowDTO;
  onOpenRow: () => void;
  thumbsRef?: React.Ref<HTMLButtonElement>;
}) {
  const { all, first, more } = headingTitles(row.anchors);
  return (
    <SectionHeading
      icon={<ThumbStack ref={thumbsRef} anchors={row.anchors} onOpen={onOpenRow} label="Why this row" />}
      className="min-w-0"
    >
      <span className="line-clamp-1 hidden sm:inline">Because you loved {joinTitles(all)}</span>
      <span className="line-clamp-1 sm:hidden">
        Because you loved {first}
        {more > 0 ? ` & ${more} more` : ""}
      </span>
    </SectionHeading>
  );
}

export function SeedHeading({ row }: { row: RecRowDTO }) {
  const seed = row.anchors[0];
  return (
    <SectionHeading icon={seed ? <ThumbStack anchors={[seed]} label="" /> : undefined} className="min-w-0">
      <span className="line-clamp-1">More like {seed?.title ?? "this"}</span>
    </SectionHeading>
  );
}

export function ForYouHeading({ subline }: { subline: string | null }) {
  return (
    <div className="min-w-0">
      <SectionHeading icon={<Sparkles className="h-5 w-5 text-brand" />}>For you</SectionHeading>
      {subline && <p className="mt-1 text-xs font-medium text-muted-foreground">{subline}</p>}
    </div>
  );
}
