/**
 * Static mock data for the social-signal design lab (/design/social).
 * Uses real, stable TMDB ids so posters/backdrops load from the production CDN
 * (same source the live cards use) — this is a throwaway design playground, not
 * wired to the DB.
 */

export type MockMediaType = "movie" | "series";

export interface MockTitle {
  id: number;
  type: MockMediaType;
  title: string;
  year: number;
  /** Community vote average (0–10). */
  communityScore: number;
  // --- viewer signals (what we're designing) ---
  /** Viewer's own rating in stars (0.5–5) or null. */
  myStars: number | null;
  /** Viewer "loved it" heart. */
  loved: boolean;
  watched: boolean;
  watchlisted: boolean;
  /** For series: episodes watched / total (current cycle). null for movies. */
  progress: { watched: number; total: number; upNext?: string } | null;
  // --- social proof ---
  discussions: number;
  reviews: number;
  /** People in the viewer's follow graph active on this title (friend-scoped). */
  friendsActive: number;
}

export const CDN = "https://image.themoviebrowser.com";
export const poster = (t: MockTitle) => `${CDN}/${t.type}/${t.id}/poster.webp`;
export const backdrop = (t: MockTitle) => `${CDN}/${t.type}/${t.id}/backdrop.webp`;
export const logo = (t: MockTitle) => `${CDN}/${t.type}/${t.id}/logo.webp`;

export const TITLES: MockTitle[] = [
  {
    id: 100088,
    type: "series",
    title: "The Last of Us",
    year: 2023,
    communityScore: 8.6,
    myStars: 4.5,
    loved: true,
    watched: false,
    watchlisted: false,
    progress: { watched: 6, total: 9, upNext: "S1E7" },
    discussions: 1240,
    reviews: 388,
    friendsActive: 4,
  },
  {
    id: 872585,
    type: "movie",
    title: "Oppenheimer",
    year: 2023,
    communityScore: 8.1,
    myStars: 5,
    loved: true,
    watched: true,
    watchlisted: false,
    progress: null,
    discussions: 902,
    reviews: 511,
    friendsActive: 7,
  },
  {
    id: 95396,
    type: "series",
    title: "Severance",
    year: 2022,
    communityScore: 8.4,
    myStars: null,
    loved: false,
    watched: false,
    watchlisted: true,
    progress: { watched: 9, total: 9, upNext: undefined },
    discussions: 2110,
    reviews: 274,
    friendsActive: 11,
  },
  {
    id: 438631,
    type: "movie",
    title: "Dune",
    year: 2021,
    communityScore: 7.8,
    myStars: 4,
    loved: false,
    watched: true,
    watchlisted: false,
    progress: null,
    discussions: 640,
    reviews: 420,
    friendsActive: 2,
  },
  {
    id: 1396,
    type: "series",
    title: "Breaking Bad",
    year: 2008,
    communityScore: 8.9,
    myStars: 5,
    loved: true,
    watched: false,
    watchlisted: false,
    progress: { watched: 41, total: 62, upNext: "S4E3" },
    discussions: 5400,
    reviews: 1280,
    friendsActive: 9,
  },
  {
    id: 496243,
    type: "movie",
    title: "Parasite",
    year: 2019,
    communityScore: 8.5,
    myStars: null,
    loved: false,
    watched: false,
    watchlisted: true,
    progress: null,
    discussions: 730,
    reviews: 690,
    friendsActive: 1,
  },
  {
    id: 136315,
    type: "series",
    title: "The Bear",
    year: 2022,
    communityScore: 8.3,
    myStars: 4.5,
    loved: false,
    watched: false,
    watchlisted: false,
    progress: { watched: 14, total: 28, upNext: "S2E6" },
    discussions: 980,
    reviews: 215,
    friendsActive: 5,
  },
  {
    id: 157336,
    type: "movie",
    title: "Interstellar",
    year: 2014,
    communityScore: 8.4,
    myStars: 5,
    loved: true,
    watched: true,
    watchlisted: false,
    progress: null,
    discussions: 1500,
    reviews: 870,
    friendsActive: 3,
  },
];

/** Locale-aware count abbreviation (the research's i18n gotcha — keep it real). */
export function formatCount(n: number, locale = "en"): string {
  try {
    return new Intl.NumberFormat(locale, {
      notation: "compact",
      maximumFractionDigits: 1,
    }).format(n);
  } catch {
    return String(n);
  }
}

/**
 * Curated CINEMATIC accent candidates for the lab's switcher. The dulled signal
 * tone (`--sig`) derives from whichever `--brand` is active, so flipping these
 * re-tints every personal signal too. `brand` = dark-mode OKLch; `rgb` ≈ sRGB
 * for the glow shadows. The first entry is the lab default.
 */
/**
 * Scientifically-curated accent set for a dark/OLED UI. Built on the two anchors
 * (Crimson Vivid, Netflix Red) and reasoned across three axes: WCAG contrast vs
 * black (lightness ≥0.60 ⇒ small-text AA; deeper ⇒ fills-only), colour psychology
 * (hue → emotion), and brand fit (cinema + social). `~` ratios = WCAG vs #000.
 */
export const ACCENTS: { key: string; label: string; brand: string; rgb: string }[] = [
  // — RED FAMILY (passion / energy / cinema) —
  { key: "crimson-vivid", label: "★ Crimson vivid — passion+premium (~4.8:1)", brand: "oklch(0.61 0.23 18)", rgb: "232 38 72" },
  { key: "carmine-luxe", label: "Carmine luxe — velvet/theatre (fills, ~4.0:1)", brand: "oklch(0.54 0.21 13)", rgb: "196 28 70" },
  { key: "scarlet", label: "Scarlet — crimson↔netflix midpoint (~5:1)", brand: "oklch(0.59 0.235 22)", rgb: "234 36 52" },
  { key: "netflix", label: "★ Netflix red #E50914 — blockbuster (~4.4:1)", brand: "oklch(0.56 0.23 27)", rgb: "229 9 20" },
  { key: "vermilion", label: "Vermilion — warm/approachable (~5.4:1)", brand: "oklch(0.65 0.21 38)", rgb: "240 96 56" },
  // — PRESTIGE (max contrast, awards/golden-age) —
  { key: "marquee-gold", label: "Marquee gold — prestige (~8:1)", brand: "oklch(0.80 0.16 80)", rgb: "226 168 60" },
  // — COOL WANDERERS (complement to warm poster art) —
  { key: "cinematic-teal", label: "Cinematic teal — teal&orange grade (~6:1)", brand: "oklch(0.70 0.13 200)", rgb: "40 178 182" },
  { key: "electric-cerise", label: "Electric cerise — creative/differentiated (~5:1)", brand: "oklch(0.63 0.26 350)", rgb: "240 44 132" },
];
