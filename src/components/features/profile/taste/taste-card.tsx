import Image from "next/image";
import { Dna } from "lucide-react";
import { TMDB_IMAGE_BASE } from "@/lib/constants";
import type { TasteClusterView, TasteSnapshot } from "@/lib/taste/profile";
import type { TitleRef } from "@/lib/taste/types";
import { cn } from "@/lib/utils";
import type { ProfileWidgetData } from "../widgets/types";
import { WidgetCard } from "../widgets/widget-card";
import { AxisStrand } from "./axis-strand";
import { TasteCompareProvider } from "./compare-overlay";
import { EvidenceGrid } from "./evidence-grid";
import { ExploreTrigger } from "./explore-trigger";
import { LazyClusterExplorer } from "./lazy-bodies";
import { MoodChip } from "./mood-chip";
import { TasteCardActions } from "./taste-card-actions";
import { clusterDescription } from "./taste-copy";
import { displayMoods, hasTasteCard, readyTaste } from "./taste-data";

/** DOM id the match card scrolls to ("Compare on the strand"). */
export const TASTE_CARD_ID = "taste-card";

function Poster({ t, className }: { t: TitleRef; className?: string }) {
  return (
    <span
      className={cn(
        "relative block aspect-[2/3] overflow-hidden rounded-lg bg-muted ring-1 ring-border transition-[box-shadow] group-hover:ring-2 group-hover:ring-brand/60",
        className
      )}
    >
      {t.posterPath ? (
        <Image
          src={`${TMDB_IMAGE_BASE}/w342${t.posterPath}`}
          alt={t.title}
          fill
          unoptimized
          className="object-cover"
          sizes="(max-width:768px) 45vw, 140px"
        />
      ) : (
        <span className="flex h-full items-center justify-center p-2 text-center text-xs text-muted-foreground">{t.title}</span>
      )}
    </span>
  );
}

/** Overlap on desktop only when 3–4 posters share the 280px column; 2 fill it side by side. */
function posterLayout(n: number) {
  return {
    grid: n >= 4 ? "grid-cols-4" : n === 3 ? "grid-cols-3" : "grid-cols-2",
    width: n >= 3 ? "md:w-[88px]" : "md:w-[134px]",
    overlap: n >= 3,
  };
}

function ClusterPosters({ clusters, moods }: { clusters: TasteClusterView[]; moods: TasteSnapshot["moods"] }) {
  const shown = clusters.slice(0, 4);
  const l = posterLayout(shown.length);
  return (
    <div>
      <ul className={cn("grid gap-3 md:flex md:gap-3", l.grid, l.overlap && "md:gap-0")}>
        {shown.map((c, i) => (
          <li
            key={`${c.medoid.mediaType}-${c.medoid.tmdbId}`}
            className={cn("relative min-w-0", l.width, l.overlap && i > 0 && "md:-ml-6")}
            style={{ zIndex: shown.length - i }}
          >
            <ExploreTrigger
              tap="cluster"
              ariaLabel={`${c.label}: ${clusterDescription(c)}`}
              title={c.label}
              description={clusterDescription(c)}
              className="group block w-full rounded-lg text-left"
              label={
                <>
                  <Poster t={c.medoid} />
                  <span className="mt-2 line-clamp-2 block text-xs font-semibold md:hidden">{c.label}</span>
                </>
              }
            >
              <LazyClusterExplorer cluster={c} moods={moods} />
            </ExploreTrigger>
          </li>
        ))}
      </ul>
      <p className="mt-2 hidden text-xs font-medium text-muted-foreground md:line-clamp-2">
        {shown.map((c) => c.label).join(" · ")}
      </p>
    </div>
  );
}

/** Fewer than two clusters: the Four Favourites stand in (still truthful — they are the titles). */
function FavoritePosters({ favorites }: { favorites: TitleRef[] }) {
  const shown = favorites.slice(0, 4);
  const l = posterLayout(shown.length);
  return (
    <div>
      <ul className={cn("grid gap-3 md:flex md:gap-3", l.grid, l.overlap && "md:gap-0")}>
        {shown.map((t, i) => (
          <li
            key={`${t.mediaType}-${t.tmdbId}`}
            className={cn("relative min-w-0", l.width, l.overlap && i > 0 && "md:-ml-6")}
            style={{ zIndex: shown.length - i }}
          >
            <ExploreTrigger
              tap="cluster"
              ariaLabel="Four favourites"
              title="Four favourites"
              description={`${shown.length} ${shown.length === 1 ? "title" : "titles"}`}
              className="group block w-full rounded-lg text-left"
              label={<Poster t={t} />}
            >
              <EvidenceGrid titles={shown} />
            </ExploreTrigger>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-xs font-medium text-muted-foreground">Four favourites</p>
    </div>
  );
}

/**
 * The profile Taste card (taste v2 spec §4.1–4.2): cluster posters + the axis
 * strand + the top three moods, every element a door to its titles. Rendered
 * on the server from the PUBLIC snapshot (cacheable, viewer-agnostic); Compare
 * and Share are client islands that know nothing until the viewer resolves.
 */
export function TasteCard({ data }: { data: ProfileWidgetData }) {
  const taste = readyTaste(data);
  if (!hasTasteCard(taste)) return null;
  const moods = displayMoods(taste);
  const firstName = data.displayName.split(/\s+/)[0] || data.displayName;
  const posters =
    taste.clusters.length >= 2 ? (
      <ClusterPosters clusters={taste.clusters} moods={moods} />
    ) : data.fourFavorites.length > 0 ? (
      <FavoritePosters favorites={data.fourFavorites} />
    ) : null;

  return (
    <div id={TASTE_CARD_ID} className="h-full scroll-mt-24">
      <WidgetCard
        title="Taste"
        icon={<Dna className="h-4 w-4" />}
        action={
          <span className="text-xs font-medium tabular-nums text-muted-foreground">
            {taste.positiveCount} {taste.positiveCount === 1 ? "title" : "titles"}
          </span>
        }
      >
        <TasteCompareProvider ownerName={firstName}>
          <div className="flex flex-col gap-5 md:flex-row md:gap-8">
            {posters && <div className="md:w-[280px] md:flex-shrink-0">{posters}</div>}
            <div className="min-w-0 flex-1 space-y-4">
              {taste.axes.length > 0 && <AxisStrand axes={taste.axes} />}
              {moods.length > 0 && (
                <ul className="flex flex-wrap gap-2" aria-label="Top moods and themes">
                  {moods.slice(0, 3).map((m) => (
                    <li key={`${m.type}:${m.key}`}>
                      <MoodChip facet={m} tinted />
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
          <div className="mt-4">
            <TasteCardActions
              username={data.username}
              displayName={data.displayName}
              axes={taste.axes.map((a) => ({ lowLabel: a.lowLabel, highLabel: a.highLabel, value: a.value }))}
              positiveCount={taste.positiveCount}
            />
          </div>
        </TasteCompareProvider>
      </WidgetCard>
    </div>
  );
}
