"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { Loader2, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useDebounce } from "@/hooks/use-debounce";
import { useAnalytics } from "@/hooks/use-analytics";
import { getAutocompleteSuggestions, type AutocompleteSuggestion } from "@/server/actions/autocomplete";
import { setFourFavoritesAction } from "@/server/actions/profile";
import { TMDB_IMAGE_BASE } from "@/lib/constants";
import type { FavoriteItemDTO } from "@/types/social";

interface FourFavoritesEditorProps {
  initial: FavoriteItemDTO[];
}

function SlotSearch({ onPick }: { onPick: (item: FavoriteItemDTO) => void }) {
  const [query, setQuery] = useState("");
  const debounced = useDebounce(query, 300);
  const [suggestions, setSuggestions] = useState<AutocompleteSuggestion[]>([]);

  useEffect(() => {
    const trimmed = debounced.trim();
    let cancelled = false;
    // setState confined to the async closure (avoids the react-hooks
    // set-state-in-effect rule's synchronous-body flag).
    void (async () => {
      if (trimmed.length < 2) {
        if (!cancelled) setSuggestions([]);
        return;
      }
      try {
        const response = await getAutocompleteSuggestions(trimmed);
        if (cancelled) return;
        setSuggestions(
          response.suggestions.filter(
            (s) => s.type === "title" && s.id !== undefined && s.mediaType !== "person"
          )
        );
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [debounced]);

  return (
    <div className="w-64 space-y-2">
      <Input
        autoFocus
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search a title…"
        className="h-10"
      />
      <ul className="max-h-56 space-y-0.5 overflow-y-auto">
        {suggestions.slice(0, 6).map((s) => (
          <li key={`${s.mediaType}-${s.id}`}>
            <button
              type="button"
              className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm hover:bg-muted/50"
              onClick={() =>
                onPick({
                  mediaType: s.mediaType === "movie" ? "movie" : "series",
                  tmdbId: s.id as number,
                  title: s.label,
                  posterPath: s.posterPath ?? null,
                })
              }
            >
              <span className="relative h-12 w-8 flex-shrink-0 overflow-hidden rounded bg-muted">
                {s.posterPath && (
                  <Image src={`${TMDB_IMAGE_BASE}/w92${s.posterPath}`} alt="" fill className="object-cover" sizes="32px" />
                )}
              </span>
              <span className="min-w-0">
                <span className="block truncate font-medium">{s.label}</span>
                {s.year && <span className="text-xs text-muted-foreground">{s.year}</span>}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Four Favorites editor: 4 slots, search to fill, max 4 enforced by shape. */
export function FourFavoritesEditor({ initial }: FourFavoritesEditorProps) {
  const [slots, setSlots] = useState<(FavoriteItemDTO | null)[]>([
    initial[0] ?? null,
    initial[1] ?? null,
    initial[2] ?? null,
    initial[3] ?? null,
  ]);
  const [openSlot, setOpenSlot] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const { trackAction } = useAnalytics();

  const handleSave = async () => {
    setBusy(true);
    try {
      const items = slots
        .filter((s): s is FavoriteItemDTO => s !== null)
        .map((s) => ({ mediaType: s.mediaType, tmdbId: s.tmdbId }));
      const result = await setFourFavoritesAction({ items });
      if (result.ok) {
        toast.success("Favorites saved");
        trackAction({ action: "four_favorites_edit", metadata: { count: items.length } });
      } else {
        toast.error(result.error);
      }
    } catch {
      toast.error("Couldn't save favorites");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-4 gap-2 sm:gap-3 max-w-md">
        {slots.map((slot, i) => (
          <Popover key={i} open={openSlot === i} onOpenChange={(o) => setOpenSlot(o ? i : null)}>
            <PopoverTrigger asChild>
              <button
                type="button"
                className="group relative aspect-[2/3] overflow-hidden rounded-lg border bg-card transition-colors hover:border-brand/50"
                aria-label={slot ? `Replace ${slot.title}` : "Add favorite"}
              >
                {slot ? (
                  <>
                    {slot.posterPath && (
                      <Image
                        src={`${TMDB_IMAGE_BASE}/w342${slot.posterPath}`}
                        alt={slot.title}
                        fill
                        className="object-cover"
                        sizes="(max-width: 768px) 25vw, 112px"
                      />
                    )}
                    <span
                      role="button"
                      tabIndex={0}
                      aria-label={`Remove ${slot.title}`}
                      className="absolute right-1 top-1 flex size-6 items-center justify-center rounded-full bg-black/70 text-white opacity-0 transition-opacity group-hover:opacity-100"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setSlots((prev) => prev.map((p, j) => (j === i ? null : p)));
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          e.stopPropagation();
                          setSlots((prev) => prev.map((p, j) => (j === i ? null : p)));
                        }
                      }}
                    >
                      <X className="h-3.5 w-3.5" />
                    </span>
                  </>
                ) : (
                  <span className="flex h-full items-center justify-center">
                    <Plus className="h-5 w-5 text-muted-foreground" />
                  </span>
                )}
              </button>
            </PopoverTrigger>
            <PopoverContent align="start" className="p-3">
              <SlotSearch
                onPick={(item) => {
                  setSlots((prev) => prev.map((p, j) => (j === i ? item : p)));
                  setOpenSlot(null);
                }}
              />
            </PopoverContent>
          </Popover>
        ))}
      </div>
      <Button variant="outline" size="sm" disabled={busy} onClick={() => void handleSave()}>
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save favorites"}
      </Button>
    </div>
  );
}
