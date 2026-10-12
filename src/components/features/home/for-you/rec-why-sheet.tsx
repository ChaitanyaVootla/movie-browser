"use client";

/**
 * "Why this pick" (spec §3.3) — Popover at md+, Vaul Drawer on mobile (Back
 * dismisses via useHistoryDismiss). Loaded with next/dynamic on first open;
 * everything it shows is already in the DTO (zero network). Copy is numbers +
 * titles only (Fable rule).
 */
import { useMemo, useState, type ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { CueEntryButton } from "@/components/features/ai/cue-entry";
import { useMobile } from "@/hooks/use-mobile";
import { useHistoryDismiss } from "@/hooks/use-history-dismiss";
import { TMDB_IMAGE_BASE } from "@/lib/constants";
import { getMediaPath } from "@/lib/utils";
import type { RecItemDTO, RecRowDTO, RecThumbRef } from "@/lib/taste/recommend-types";
import { cosBucket, refKey, whyCueMessage } from "./rec-copy";

export type WhyTarget = { kind: "item"; item: RecItemDTO; row: RecRowDTO } | { kind: "row"; row: RecRowDTO };

export interface RecWhySheetProps {
  target: WhyTarget | null;
  anchorEl: HTMLElement | null;
  onClose: () => void;
  onMoreLikeThis: (item: RecItemDTO, row: RecRowDTO) => void;
  onDismiss: (item: RecItemDTO, row: RecRowDTO) => void;
}

function Poster({ a, w, h }: { a: RecThumbRef; w: string; h: string }) {
  const src = a.posterPath ? `${TMDB_IMAGE_BASE}/w92${a.posterPath}` : null;
  return (
    <span className={`relative block flex-shrink-0 overflow-hidden rounded-md bg-muted ${w} ${h}`}>
      {src && <Image src={src} alt="" fill sizes="36px" className="object-cover" unoptimized />}
    </span>
  );
}

function ItemBody({ item, row, onMoreLikeThis, onDismiss }: { item: RecItemDTO; row: RecRowDTO } & Pick<RecWhySheetProps, "onMoreLikeThis" | "onDismiss">) {
  const e = item.explanation;
  return (
    <div className="space-y-4">
      {e?.kind === "because" && (
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <Poster a={e.anchor} w="w-9" h="h-[54px]" />
            <div className="min-w-0 flex-1">
              <p className="line-clamp-2 text-sm font-semibold">{e.anchor.title}</p>
              <p className="text-xs font-medium text-muted-foreground">
                {e.cos != null ? (
                  <>
                    {cosBucket(e.cos)} to this pick · <span className="tabular-nums">{e.cos.toFixed(2)}</span>
                  </>
                ) : (
                  "a favourite this pick follows from"
                )}
              </p>
            </div>
          </div>
          {e.alsoNear && e.alsoNear.length > 0 && (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-xs font-medium text-muted-foreground">
              <span>Also near</span>
              {e.alsoNear.map((a) => (
                <span key={refKey(a)} className="inline-flex items-center gap-1.5 text-foreground">
                  <Poster a={a} w="w-[14px]" h="h-[21px]" />
                  <span className="line-clamp-1">{a.title}</span>
                </span>
              ))}
            </div>
          )}
        </div>
      )}
      {(e?.kind === "facet" || e?.kind === "popular") && <p className="text-sm font-medium">{e.label}</p>}
      {e?.kind === "seed" && (
        <p className="text-sm font-medium">
          Close to {e.seed.title} · <span className="tabular-nums">{e.cos.toFixed(2)}</span>
        </p>
      )}
      {(e?.kind === "because" || e?.kind === "facet") && e.facets && e.facets.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-muted-foreground">
          <span>Shares</span>
          {e.facets.map((f) => (
            <span key={f} className="rounded-full bg-muted px-2.5 py-1 text-muted-foreground">
              {f}
            </span>
          ))}
        </div>
      )}
      <div className="flex flex-wrap gap-2 border-t pt-4">
        <Button variant="secondary" size="sm" className="min-h-10 md:min-h-8" onClick={() => onMoreLikeThis(item, row)}>
          More like this
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="min-h-10 text-destructive hover:text-destructive md:min-h-8"
          onClick={() => onDismiss(item, row)}
        >
          Not for me
        </Button>
      </div>
      <CueEntryButton entry="why_sheet" variant="link" label="Why would I like this?" message={whyCueMessage(item)} />
    </div>
  );
}

function RowBody({ row }: { row: RecRowDTO }) {
  const [showAll, setShowAll] = useState(false);
  const size = row.groupSize ?? row.anchors.length;
  const rest = Math.max(0, size - row.anchors.length);
  return (
    <div className="space-y-4">
      <ul className="space-y-2">
        {row.anchors.map((a) => (
          <li key={refKey(a)} className="flex items-center gap-3">
            <Poster a={a} w="w-9" h="h-[54px]" />
            <span className="line-clamp-2 text-sm font-semibold">{a.title}</span>
          </li>
        ))}
      </ul>
      {rest > 0 && (
        <p className="text-xs font-medium text-muted-foreground">
          and <span className="tabular-nums">{rest}</span> more {rest === 1 ? "title" : "titles"} in this group
        </p>
      )}
      {row.members && row.members.length > row.anchors.length && (
        <>
          {!showAll ? (
            <Button variant="secondary" size="sm" className="min-h-10 md:min-h-8" onClick={() => setShowAll(true)}>
              Show all {size}
            </Button>
          ) : (
            <ul className="grid grid-cols-4 gap-2">
              {row.members.map((m) => (
                <li key={refKey(m)}>
                  <Link
                    href={getMediaPath(m.mediaType, m.id, m.title)}
                    prefetch={false}
                    className="block rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <span className="relative block aspect-[2/3] overflow-hidden rounded-md bg-muted">
                      {m.posterPath && (
                        <Image src={`${TMDB_IMAGE_BASE}/w185${m.posterPath}`} alt={m.title} fill sizes="80px" className="object-cover" unoptimized />
                      )}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}

export default function RecWhySheet({ target, anchorEl, onClose, onMoreLikeThis, onDismiss }: RecWhySheetProps) {
  const isMobile = useMobile();
  const open = target !== null;
  useHistoryDismiss(open, onClose);
  const virtualRef = useMemo(() => ({ current: anchorEl }), [anchorEl]);

  const title = target?.kind === "row" ? "Why this row" : "Why this pick";
  const description =
    target?.kind === "row" ? "The titles this row grows from" : target ? `About ${target.item.title}` : "";
  const body: ReactNode =
    target?.kind === "item" ? (
      <ItemBody item={target.item} row={target.row} onMoreLikeThis={onMoreLikeThis} onDismiss={onDismiss} />
    ) : target?.kind === "row" ? (
      <RowBody row={target.row} />
    ) : null;

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={(o) => !o && onClose()}>
        <DrawerContent className="pb-[calc(env(safe-area-inset-bottom,0px)+1rem)]">
          <DrawerHeader className="text-left">
            <DrawerTitle>{title}</DrawerTitle>
            <DrawerDescription>{description}</DrawerDescription>
          </DrawerHeader>
          <div className="px-4">{body}</div>
        </DrawerContent>
      </Drawer>
    );
  }
  return (
    <Popover open={open} onOpenChange={(o) => !o && onClose()}>
      {anchorEl && <PopoverAnchor virtualRef={virtualRef as React.RefObject<HTMLElement>} />}
      <PopoverContent align="start" className="w-80">
        <p className="mb-1 text-sm font-semibold">{title}</p>
        <p className="mb-4 text-xs font-medium text-muted-foreground">{description}</p>
        {body}
      </PopoverContent>
    </Popover>
  );
}
