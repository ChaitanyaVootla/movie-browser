import {
  LAYOUT_COLS,
  type ProfileLayout,
  type ProfileWidgetData,
  type WidgetInstance,
  type WidgetMeta,
  type WidgetType,
} from "./types";

/** Static metadata for every widget type — safe to import anywhere (no JSX). */
export const WIDGET_META: Record<WidgetType, WidgetMeta> = {
  "stat.films": { type: "stat.films", category: "stat", title: "Films watched", defaultSize: { w: 3, h: 1 }, minSize: { w: 2, h: 1 }, maxSize: { w: 4, h: 1 }, mobileSpan: 1, isAvailable: () => true },
  "stat.episodes": { type: "stat.episodes", category: "stat", title: "Episodes watched", defaultSize: { w: 3, h: 1 }, minSize: { w: 2, h: 1 }, maxSize: { w: 4, h: 1 }, mobileSpan: 1, isAvailable: () => true },
  "stat.hours": { type: "stat.hours", category: "stat", title: "Hours watched", defaultSize: { w: 3, h: 1 }, minSize: { w: 2, h: 1 }, maxSize: { w: 4, h: 1 }, mobileSpan: 1, isAvailable: () => true },
  "stat.streak": { type: "stat.streak", category: "stat", title: "Longest streak", defaultSize: { w: 3, h: 1 }, minSize: { w: 2, h: 1 }, maxSize: { w: 4, h: 1 }, mobileSpan: 1, isAvailable: () => true },
  "stat.rewatches": { type: "stat.rewatches", category: "stat", title: "Rewatches", defaultSize: { w: 3, h: 1 }, minSize: { w: 2, h: 1 }, maxSize: { w: 4, h: 1 }, mobileSpan: 1, isAvailable: (d) => d.rewatchCount > 0 },
  "stat.following": { type: "stat.following", category: "stat", title: "Following", defaultSize: { w: 3, h: 1 }, minSize: { w: 2, h: 1 }, maxSize: { w: 4, h: 1 }, mobileSpan: 1, isAvailable: (d) => d.counts.following > 0 },

  "chart.ratings": { type: "chart.ratings", category: "chart", title: "Ratings histogram", defaultSize: { w: 4, h: 2 }, minSize: { w: 3, h: 2 }, mobileSpan: 2, isAvailable: (d) => d.ratingsHistogram.some((n) => n > 0) },
  "chart.genres": { type: "chart.genres", category: "chart", title: "Top genres", defaultSize: { w: 4, h: 2 }, minSize: { w: 3, h: 2 }, mobileSpan: 2, isAvailable: (d) => d.topGenres.length > 0 },
  "chart.decades": { type: "chart.decades", category: "chart", title: "Decades", defaultSize: { w: 4, h: 2 }, minSize: { w: 3, h: 2 }, mobileSpan: 2, isAvailable: (d) => d.topDecades.length > 0 },
  "chart.countries": { type: "chart.countries", category: "chart", title: "Country map", defaultSize: { w: 6, h: 3 }, minSize: { w: 4, h: 2 }, mobileSpan: 2, isAvailable: (d) => d.topCountries.length > 0 },
  "chart.activity": { type: "chart.activity", category: "chart", title: "Watch activity", defaultSize: { w: 6, h: 2 }, minSize: { w: 4, h: 2 }, mobileSpan: 2, isAvailable: (d) => d.dailyActivity.some((x) => x.count > 0) || d.recentWatches.length > 0 },

  "showcase.favorites": { type: "showcase.favorites", category: "showcase", title: "Favorites", defaultSize: { w: 6, h: 2 }, minSize: { w: 4, h: 2 }, mobileSpan: 2, isAvailable: (d) => d.fourFavorites.length > 0 },
  "showcase.watching": { type: "showcase.watching", category: "showcase", title: "Currently watching", defaultSize: { w: 6, h: 2 }, minSize: { w: 4, h: 2 }, mobileSpan: 2, isAvailable: (d) => d.currentlyWatching.length > 0 },
  "showcase.lists": { type: "showcase.lists", category: "showcase", title: "Lists", defaultSize: { w: 6, h: 2 }, minSize: { w: 4, h: 2 }, mobileSpan: 2, isAvailable: (d) => d.pinnedLists.length > 0 },
  "showcase.reviews": { type: "showcase.reviews", category: "showcase", title: "Reviews", defaultSize: { w: 12, h: 3 }, minSize: { w: 6, h: 2 }, mobileSpan: 2, isAvailable: (d) => d.reviews.length > 0 },

  "text.note": { type: "text.note", category: "text", title: "Note", defaultSize: { w: 4, h: 1 }, minSize: { w: 3, h: 1 }, mobileSpan: 2, isAvailable: () => true },
};

export const ALL_WIDGET_TYPES = Object.keys(WIDGET_META) as WidgetType[];

/** Priority order widgets appear in the auto-generated default layout. */
const DEFAULT_ORDER: WidgetType[] = [
  "stat.films",
  "stat.episodes",
  "stat.hours",
  "stat.streak",
  "showcase.favorites",
  "showcase.watching",
  "chart.ratings",
  "chart.genres",
  "chart.decades",
  "chart.countries",
  "chart.activity",
  "showcase.lists",
  "showcase.reviews",
];

/**
 * Shelf/row packer — places widgets left-to-right, wrapping to a new row when
 * a widget won't fit in the remaining columns. Deterministic, no overlaps,
 * matches react-grid-layout's vertical-compact behaviour closely enough that
 * the static view and the editor read the same.
 */
export function buildDefaultLayout(data: ProfileWidgetData): ProfileLayout {
  const widgets: WidgetInstance[] = [];
  let cx = 0;
  let cy = 0;
  let rowH = 0;
  for (const type of DEFAULT_ORDER) {
    const meta = WIDGET_META[type];
    if (!meta.isAvailable(data)) continue;
    const { w, h } = meta.defaultSize;
    if (cx + w > LAYOUT_COLS) {
      cy += rowH;
      cx = 0;
      rowH = 0;
    }
    widgets.push({ id: type, type, x: cx, y: cy, w, h });
    cx += w;
    rowH = Math.max(rowH, h);
  }
  return { v: 1, cols: LAYOUT_COLS, widgets };
}

/** Validate + coerce a stored layout; fall back to default on anything off. */
export function resolveLayout(stored: unknown, data: ProfileWidgetData): ProfileLayout {
  if (
    stored &&
    typeof stored === "object" &&
    "widgets" in stored &&
    Array.isArray((stored as ProfileLayout).widgets)
  ) {
    const layout = stored as ProfileLayout;
    const widgets = layout.widgets.filter((w) => w && w.type in WIDGET_META);
    if (widgets.length > 0) {
      return { v: 1, cols: layout.cols || LAYOUT_COLS, widgets };
    }
  }
  return buildDefaultLayout(data);
}
