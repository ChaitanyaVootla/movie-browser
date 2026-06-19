import type { PublicProfileDTO } from "@/types/social";

/**
 * Profile dashboard widget system. A profile is a grid of widget instances;
 * each instance references a registered widget TYPE and carries grid coords +
 * optional per-instance config. The layout lives in
 * users.metadata.profile.layout (JSON, no migration). See
 * docs/superpowers/specs/2026-06-13-profile-widget-dashboard-design.md.
 */

export type WidgetType =
  | "stat.films"
  | "stat.episodes"
  | "stat.hours"
  | "stat.streak"
  | "stat.rewatches"
  | "stat.following"
  | "chart.ratings"
  | "chart.genres"
  | "chart.decades"
  | "chart.countries"
  | "chart.activity"
  | "showcase.favorites"
  | "showcase.watching"
  | "showcase.lists"
  | "showcase.reviews"
  | "showcase.discussions"
  | "text.note";

export interface WidgetInstance {
  /** Stable instance id (distinct from type — a type may appear multiple times). */
  id: string;
  type: WidgetType;
  /** Grid coords at the layout's authored column count. */
  x: number;
  y: number;
  w: number;
  h: number;
  /** Per-instance params (e.g. text.note body, favorites limit). */
  config?: Record<string, unknown>;
}

export interface ProfileLayout {
  v: 1;
  /** Column count the coords were authored at (desktop). */
  cols: number;
  widgets: WidgetInstance[];
}

/** Everything a widget can read — the cacheable public profile bundle. */
export type ProfileWidgetData = PublicProfileDTO;

export type WidgetCategory = "stat" | "chart" | "showcase" | "text";

export interface WidgetMeta {
  type: WidgetType;
  category: WidgetCategory;
  /** Palette label. */
  title: string;
  /** Default grid size at 12 cols. */
  defaultSize: { w: number; h: number };
  minSize: { w: number; h: number };
  maxSize?: { w: number; h: number };
  /** Columns to span on the 2-col mobile grid (1 = half, 2 = full). */
  mobileSpan: 1 | 2;
  /** Is this widget meaningful for this profile? Drives default layout + palette "empty" hints. */
  isAvailable: (d: ProfileWidgetData) => boolean;
}

export const LAYOUT_COLS = 12;
/** Desktop grid row height (px) — mirrors react-grid-layout rowHeight in edit mode. */
export const ROW_HEIGHT = 88;
