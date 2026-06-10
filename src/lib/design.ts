/**
 * Canonical class strings for DESIGN.md recipes (see "Code mapping" section there).
 * Import these instead of retyping the strings — when a recipe changes in DESIGN.md,
 * it changes here in the same commit.
 */

/** Non-hero page shell. Mobile has no top navbar; desktop navbar is 64px. */
export const PAGE_SHELL = "min-h-screen pt-4 md:pt-20 pb-12 px-4 md:px-8 lg:px-12";

/** Standalone horizontal page padding (for full-bleed pages that pad sections individually). */
export const PAGE_PADDING_X = "px-4 md:px-8 lg:px-12";

/** Section heading (h2): carousels, page sections. */
export const SECTION_HEADING = "text-xl font-semibold tracking-tight";

/** Overline label above content blocks (e.g. OVERVIEW). */
export const OVERLINE = "text-sm font-semibold uppercase tracking-wider text-muted-foreground";

/** Sticky in-page bar: flush to viewport top on mobile (no navbar), under the 64px navbar on desktop. */
export const STICKY_BAR = "sticky top-0 md:top-16 z-40 bg-background/95 backdrop-blur-sm border-b";

/** Safe-area top padding for mobile sticky bars (PWA notch). */
export const STICKY_BAR_SAFE_AREA = "pt-[calc(env(safe-area-inset-top,0px)+0.5rem)]";

/**
 * Hero AI tagline blockquote — capped at 2 lines so it can never push the logo into
 * the navbar, and capped at `max-w-xl` (576px ≈ the hero logo block, 500–600px) so it
 * never runs across the right-side backdrop art. Explicit `text-white/90` (not a theme
 * token): the hero base is always dark, even in light mode (see DESIGN.md Typography).
 */
export const HERO_TAGLINE =
  "border-l-2 border-brand/50 pl-3 text-xs md:text-sm text-white/90 italic font-medium text-left max-w-xl leading-relaxed line-clamp-2";
