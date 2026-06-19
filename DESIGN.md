---
version: alpha
name: The Movie Browser
description: >-
  Cinematic, OLED-dark movie & TV discovery platform. Pure-black canvas, imagery-first
  layouts, a single warm accent, and quiet typography that defers to posters and backdrops.
colors:
  background: oklch(0 0 0)
  surface: oklch(0.08 0 0)
  card: oklch(0.12 0 0)
  popover: oklch(0.12 0 0)
  on-surface: oklch(0.95 0 0)
  muted: oklch(0.15 0 0)
  on-muted: oklch(0.65 0 0)
  primary: oklch(0.95 0 0)
  on-primary: oklch(0 0 0)
  brand: oklch(0.59 0.235 22)
  on-brand: oklch(0.99 0 0)
  sig: color-mix(in oklab, var(--brand) 78%, grey)
  border: oklch(1 0 0 / 10%)
  error: oklch(0.6 0.22 25)
  success: oklch(0.72 0.17 152)
typography:
  headline-display:
    fontFamily: Montserrat
    fontSize: 3rem
    fontWeight: 700
    lineHeight: 1.1
    letterSpacing: -0.025em
  headline-lg:
    fontFamily: Montserrat
    fontSize: 1.875rem
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: -0.025em
  headline-md:
    fontFamily: Montserrat
    fontSize: 1.25rem
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: -0.025em
  headline-sm:
    fontFamily: Montserrat
    fontSize: 1.125rem
    fontWeight: 600
    lineHeight: 1.4
  body-md:
    fontFamily: Montserrat
    fontSize: 0.875rem
    fontWeight: 400
    lineHeight: 1.5
  body-sm:
    fontFamily: Montserrat
    fontSize: 0.75rem
    fontWeight: 500
    lineHeight: 1.4
  label-md:
    fontFamily: Montserrat
    fontSize: 0.875rem
    fontWeight: 600
    lineHeight: 1
  label-overline:
    fontFamily: Montserrat
    fontSize: 0.875rem
    fontWeight: 600
    lineHeight: 1
    letterSpacing: 0.05em
  tagline:
    fontFamily: Montserrat
    fontSize: 0.875rem
    fontWeight: 500
    lineHeight: 1.625
rounded:
  none: 0px
  sm: 6px
  md: 8px
  lg: 10px
  xl: 14px
  full: 9999px
spacing:
  xs: 0.25rem
  sm: 0.5rem
  md: 1rem
  lg: 1.5rem
  xl: 2.5rem
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    typography: "{typography.label-md}"
    rounded: "{rounded.md}"
    height: 36px
  button-brand:
    backgroundColor: "{colors.brand}"
    textColor: "{colors.on-brand}"
    typography: "{typography.label-md}"
    rounded: "{rounded.md}"
    height: 36px
  card:
    backgroundColor: "{colors.card}"
    textColor: "{colors.on-surface}"
    rounded: "{rounded.xl}"
  chip:
    backgroundColor: "{colors.muted}"
    textColor: "{colors.on-muted}"
    typography: "{typography.body-sm}"
    rounded: "{rounded.full}"
    height: 26px
  sticky-bar:
    backgroundColor: "{colors.background}"
    rounded: "{rounded.none}"
---

# The Movie Browser

## Overview

The Movie Browser is a cinematic discovery surface: the artwork is the interface. The
default theme is pure-black OLED dark; chrome stays nearly invisible so posters,
backdrops, and title logos carry the visual weight. Typography is quiet and compact
(Montserrat), color is monochrome except for one warm brand accent, and motion is
subtle (fades and gentle scale, never bounces). The audience is movie/TV enthusiasts
browsing on phones and TVs-adjacent desktop screens — the design must feel equally
native at 390px and 1440px.

Theming is 3-tier (mode / `.style-*` background / `.accent-*` brand). The token values
above are the **default dark theme**; never hardcode them — always go through the CSS
variables in `src/app/globals.css` (`bg-background`, `text-foreground`, `bg-card`,
`text-muted-foreground`, `bg-brand`, `border-border`, …) so every style/accent variant
keeps working. See `.claude/rules/theming.md`.

## Colors

The palette is intentionally monochrome. {colors.background} is the page canvas;
{colors.surface} is for grouped regions (sidebars, wells); {colors.card} is for
elevated cards and popovers. Text is {colors.on-surface} for primary content and
{colors.on-muted} for metadata. {colors.brand} (**Scarlet** — a deep cinematic red,
OKLch hue ~22; locked 2026-06-16) is reserved for: accents on interactive emphasis
(active states, the AI assistant, the tagline rule), ratings flair, and brand moments
— never for large fills. Foreground over a brand fill is white ({colors.on-brand}).
Borders are white at 10% alpha, not gray fills.

The brand is now a **red**, so it MUST NOT double as the danger colour: destructive
actions (delete, block, report, remove) use {colors.error} / `text-destructive`, never
`text-brand`. See Social signals → Caveats and the State semantics paragraph below.

Rules:

- Use semantic Tailwind classes (`text-foreground`, `text-muted-foreground`,
  `bg-card`, `border-border`) — never raw `text-white`, `bg-black`, `text-zinc-*`.
- Exception: content rendered **on top of imagery** (hero backdrops, poster overlays,
  trailer modals) may use `text-white` / `bg-black/60` because imagery is not themed.
- All color definitions live in OKLch in `globals.css`.

State semantics (`{colors.error}` red / `{colors.success}` green) are the only
non-monochrome, non-brand colors, and they exist solely for **go/stop feedback**:
form validation, availability checks, destructive confirmation. They are
**accent-independent** — defined once in the base light/dark blocks and NEVER
overridden per `.accent-*`, so "available" always reads green and "error" always
reads red regardless of the user's chosen accent (the brand accent itself can be
red/green/blue, so it must never carry success/error meaning). Use `text-success`
/ `text-destructive`; never repurpose `text-brand` for a positive/negative state.
Success is a calm, slightly-desaturated green (not neon) so it sits quietly in the
OLED canvas. Do not use either for decoration or large fills.

## Typography

Montserrat everywhere (`--font-sans`); Geist Mono only for keyboard hints and code.
The scale is deliberately compact — one step smaller than typical marketing sites —
because text competes with artwork.

| Role | Token | Tailwind recipe |
|------|-------|-----------------|
| Hero/person name (no logo available) | {typography.headline-display} | `text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight` |
| Page title (h1) | {typography.headline-lg} | `text-2xl md:text-3xl font-bold tracking-tight` |
| Section heading (h2: carousels, page sections) | {typography.headline-md} | `text-xl font-semibold tracking-tight` |
| Card/modal title (h3) | {typography.headline-sm} | `text-lg font-semibold` |
| Overline section label (e.g. OVERVIEW) | {typography.label-overline} | `text-sm font-semibold uppercase tracking-wider text-muted-foreground` |
| Body copy | {typography.body-md} | `text-sm text-foreground` (long-form: `leading-relaxed`) |
| Metadata/captions | {typography.body-sm} | `text-xs font-medium text-muted-foreground` |
| Buttons/labels | {typography.label-md} | shadcn defaults (`text-sm font-medium`) |
| Hero tagline (AI one-liner) | {typography.tagline} | `text-xs md:text-sm text-white/90 italic font-medium leading-relaxed line-clamp-2 max-w-xl border-l-2 border-brand/50 pl-3` |

Rules:

- Every section heading in the app uses the **same** h2 recipe. No `text-lg` or
  `text-2xl` section headings.
- Display sizes (`text-4xl`+) must always carry smaller `sm:`-first variants so they
  scale down on ≤400px phones.
- The hero tagline is capped at **2 lines** (`line-clamp-2`) and carries its own
  width cap (`max-w-xl` ≈ the hero logo block, 500–600px) so it can never run across
  the right-side backdrop art, regardless of what its parent column does.
- The hero tagline uses explicit `text-white/90`, not `text-foreground`: the hero
  base is **always dark — even in light mode** (`--hero-base` ≈ oklch 0.15, see
  `globals.css`), so theme tokens go near-black over the backdrop. This is the
  standard "content over imagery" exception (see Colors).

## Layout

Mobile has **no top navbar** — navigation is the bottom nav (`h-14` + safe-area
padding). Desktop (`md:`+) has a fixed top navbar of exactly **64px** (`h-16`,
z-50). Every offset in the app derives from these two facts:

| Concern | Recipe |
|---------|--------|
| Page top offset (non-hero pages) | `pt-[calc(env(safe-area-inset-top,0px)+1rem)] md:pt-20` (mobile: safe-area + breathing room — the inset is 0 on Android standalone but equals the status bar on iOS standalone, where content draws under it; desktop: 64px navbar + 16px) |
| Sticky in-page bars (filters, toolbars) | mobile `top-0`, desktop `md:top-16` — flush under the navbar, with `z-40 bg-background/95 backdrop-blur-sm border-b` |
| Fixed full-height panels (desktop sidebars) | `top-16 h-[calc(100dvh-4rem)]` |
| Page horizontal padding | `px-4 md:px-8 lg:px-12` (browse-style split layouts may use `px-4 md:px-6 lg:px-8` inside the content pane) |
| Vertical rhythm between page sections | `space-y-8 md:space-y-10`; heading→content gap `space-y-4` |
| Carousel/grid gaps | `gap-4` (dense poster grids: `gap-3`) |
| Bottom padding | global `main` already reserves bottom-nav space; pages add `pb-12` max |

Hero pages (movie/series/person) are the exception: the backdrop intentionally slides
under the transparent navbar, content is bottom-anchored inside `.hero-container`,
and the content column uses `.hero-content-width` (`clamp`-based, see `globals.css`).
Nothing inside the hero may force the column taller than the hero: cap every text
block (`line-clamp-*`) and keep the stack order logo → tagline → badges → ratings →
watch options.

Sparse titles with **no backdrop art at all** (CDN and TMDB both missing) get a
compact hero instead of an empty void: `HeroBackdropShell` marks itself
`data-backdrop-state="failed"`, `.hero-container:has(...)` in `globals.css` collapses
the fixed clamp height to `auto`, and the content flows at natural height (`md:pt-20`
to clear the navbar; mobile `pt-[calc(env(safe-area-inset-top,0px)+2.5rem)]` — the
inset covers the iOS standalone status bar). The with-backdrop layout is unchanged.

Viewport rules: use `dvh`/`svh`, never `vh`, for anything full-height (mobile Safari).
Respect `env(safe-area-inset-*)` on fixed/sticky top and bottom elements. Touch
targets ≥ 40px on mobile.

### System bars (installed PWA, "native edge-to-edge")

Platform facts (researched Jun 2026): an Android standalone PWA **cannot** draw
under the top status bar — Chrome's edge-to-edge (135+) extends the viewport only
into the **bottom** gesture bar; the status bar is an opaque strip painted with
`theme-color`. iOS standalone (`black-translucent`) **does** draw content under the
status bar (`safe-area-inset-top` = its height there; 0 on Android). The native
look is therefore an illusion built from three pieces, all mandatory:

1. **`.hero-top-scrim`** (`globals.css`) on every mobile hero image: a gradient
   that is **solid `--hero-base` at y=0** and fades down over ~4rem (+ the top
   inset). Solid-at-top is the load-bearing part — on Android the opaque status
   bar sits directly above the image, and any alpha < 1 at the seam reads as a
   hard edge. On iOS the same scrim keeps the clock legible over the bleed.
2. **Status bar color = what's under it**: `ThemeColorSync` paints `theme-color`
   with the hero's `--hero-base` while a `[data-hero-root]` element is under the
   status bar seam, and with the page background otherwise (re-evaluated on
   scroll). Without this, light mode shows a light bar above a dark hero.
3. **Bottom bleed**: `viewportFit: "cover"` + the translucent blurred bottom nav
   extending through `env(safe-area-inset-bottom)`; content scrolls under it.

Don't try `display: fullscreen` for "more native" — it hides the clock/battery
entirely, which native media apps don't do.

## Elevation & Depth

Depth comes from **lightness steps, not shadows**: background (L 0) → surface
(L 0.08) → card (L 0.12) → muted (L 0.15). Shadows are reserved for true overlays:
`shadow-sm` on cards is acceptable, `shadow-lg` for popovers/dropdowns, `shadow-2xl`
plus the `.ai-container-shadow` glow only for the AI assistant. Sticky bars get
separation from `backdrop-blur` + `border-b`, not shadows. Hero imagery blends into
the canvas with the `--hero-base-rgb` gradients (left-edge on desktop, bottom-up on
mobile) — `--hero-base` must always equal `--background`.

## Shapes

Base radius is 10px (`--radius: 0.625rem`). Cards and modals use {rounded.xl}
(`rounded-xl`); buttons, inputs, and menu items use {rounded.md} (`rounded-md`);
poster/backdrop images use `rounded-lg`; pills, chips, badges, and avatars are
{rounded.full}. Never introduce arbitrary radii (`rounded-[Npx]`) outside the scale.

## Social signals

The visual vocabulary for personal state, "you vs community", and social proof —
identical on every surface a title appears (cards, carousels, detail, profile).
Finalized 2026-06-16 (`docs/superpowers/specs/2026-06-16-social-signals-consolidation-design.md`).

**One accent, theme-led — no palette.** All personal signals ride a single dulled
accent tone, {colors.sig} (`--sig` = `color-mix(in oklab, var(--brand) 78%, grey)`),
plus neutral/over-imagery white. There is **no multi-hue palette** (we rejected the
Letterboxd green/orange/blue — it fights a single-accent cinematic brand). States are
told apart by **glyph + shape + fill**, never by hue, so they re-tint automatically
when the accent changes.

**Personal-state glyphs** (`--sig`-toned, small):

| State | Glyph |
|-------|-------|
| Watched | grayscale poster + eye/check tick |
| Loved | filled heart in `--sig` |
| Rated | star whose fill is **`%`-filled** in `--sig` (the partial fill encodes the value, e.g. 70% = 3.5★) |
| Watchlisted | bookmark |

**"You" vs "community" must never look the same.** Your rating = a filled `--sig`
star (`%`-filled to your value); the community average = **neutral** (white/muted),
never `--sig`. The two are visually distinct at a glance on the same surface.

**Poster card slots** (`MovieCard`):

- **Top-right** — community vote chip (`vote_average`). Neutral. Unchanged.
- **Bottom-left (inverted-corner scoop)** — the **personal cluster** (`%`-star + heart
  / watched tick / bookmark). When the viewer has state it **supersedes** the
  quality/media badge (Trending/New…); with no viewer state it falls back to that
  badge. This kills the old BL/BR split — the bottom-right user-status badge folds in.
- **Bottom edge** — a **3px hairline progress bar** in `--sig` for in-progress series.
  The bottom-left chip **lifts 3px** so it never overlaps or notches the bar.
- **Whole poster** — grayscale when watched (watched is conveyed by grayscale; the
  chip carries rating/heart).

**Wide card** — backdrop carries a **footer line of social proof** on the image
(`💬 discussing · 👥 friends`); the title moves **below** the card (no in-card title),
and the same `--sig` hairline progress bar sits on the bottom edge.

**Community data viz** — the rating-distribution **histogram bars use true `--brand`**
(the full-saturation Scarlet), NOT the dulled `--sig`. Only the small personal glyphs
(your star/heart, progress bar) use `--sig`. This keeps the community signal vivid and
the personal signal quiet.

**Counts** — locale-aware via `Intl.NumberFormat` compact notation (renders lakhs /
crore as well as K / M); **never hardcode `K`/`M`**. Apply a **threshold ≥ 5** before
rendering any count (don't show "1 review" / "2 watching") — sub-threshold social
proof reads as negative. Mirrors the existing discussion-badge rule.

**Caveats:**

- **`--brand` is red — destructive actions must not use it.** Delete / block / report /
  remove use {colors.error} / `text-destructive` (or distinct iconography + labels),
  never `--brand`. Audit destructive UI wherever the accent lands.
- Personal/viewer state (your rating, progress, "friends here") **hydrates
  client-side** — it must never bake into ISR-cacheable HTML (see
  `.claude/rules/social-features.md` § HARD INVARIANTS, edge-cache). Global counts are
  cacheable; personal signals are client islands.

## Components

- **Buttons** — shadcn `Button` only. Primary actions use the default (inverted
  white-on-black in dark mode); brand-colored buttons are reserved for the single
  most important action on a screen. Icon buttons on mobile need `size-10` minimum.
- **Chips/badges** — `Badge` with `rounded-full`; metadata chips use
  `bg-muted text-muted-foreground`; AI/standout tags may tint with `bg-brand/15
  text-brand`.
- **Cards** — `bg-card border rounded-xl`; poster cards are bare images with
  `rounded-lg` and overlay actions, not boxed cards.
- **Sticky filter/tool bars** — the `sticky-bar` recipe from Layout: full-bleed,
  `bg-background/95 backdrop-blur-sm border-b`, sits flush under the navbar on
  desktop and at `top-0` on mobile (with safe-area padding). Filters open in a
  `Drawer` on mobile, persistent sidebar on `md:`+.
- **Dialogs vs Drawers** — confirmation/forms use `Dialog` on desktop; on mobile
  EVERY slide-up surface is a **Vaul `Drawer`** (`isMobile ? <Drawer> : <Dialog>`),
  never a centered `Dialog` or a Radix `Sheet side="bottom"` — Vaul gives native
  drag-down-to-dismiss, scrim tap, and spring motion. Every mobile overlay MUST
  wire the hardware/gesture Back button to close (not navigate the page) via
  `useHistoryDismiss(open, onClose)` (`src/hooks/use-history-dismiss.ts`); see
  `.claude/rules/pwa-mobile.md` → "Mobile overlays".
- **Scrollers** — horizontal media rows use `media-scroller` with `gap-4`,
  `scrollbar-hide`, edge-fade, and arrow buttons hidden on touch devices.
- **Navigation pending** — card links in grids/carousels use `prefetch={false}`
  (the server cannot absorb viewport prefetch storms), so every internal card
  link must give instant click feedback instead: `CardPendingOverlay` (a
  `bg-black/50` dim over the image + a centered 28px spinner ring,
  `border-white/30` with a `border-t-brand` tip) rendered inside the card's
  `relative` image container, as a descendant of the `<Link>`. Text/button
  links use `InlinePendingSpinner` (16px, `currentColor`). Both fade in only
  after a **150ms delay** (`.nav-pending-in` in `globals.css`) so fast/cached
  navigations never flash a spinner. Hardcoded white/black is correct here —
  the overlay sits over imagery.
- **Floating bottom-center zone is reserved for the AI assistant** (idle bubble at
  `bottom-6` desktop / `bottom-[calc(4.25rem+env(safe-area-inset-bottom,0px))]`
  mobile, z-50 — the mobile offset tracks the gesture-bar inset because the bottom
  nav grows by it under edge-to-edge). Transient overlays (install banner, toasts)
  must not occupy it: dock bottom-right on desktop, or sit above the bubble zone
  (`bottom-[calc(8rem+safe-area)]`) on mobile.
- **AI chat window controls** — X always dismisses to the bubble and never clears
  the conversation; "New conversation" (RotateCcw, shown only when a conversation
  exists) is the sole destructive action. Desktop minimal view: Send · Expand · X.
  Desktop expanded header: New · Collapse · X. Mobile drawer header: New ·
  ChevronDown (plus swipe/scrim dismiss).
- **shadcn/ui primitives in `src/components/ui/` are read-only** — wrap, don't edit.

### Code mapping

The recipes above have canonical implementations — **import them, never retype the
class strings**:

| Recipe | Import |
|--------|--------|
| Page shell (non-hero pages) | `<PageMain>` — `@/components/features/layout/page-main` |
| Section heading + header row | `<SectionHeading>` — `@/components/features/layout/section-heading` |
| Sticky bar, hero tagline, overline label, page padding constants | `@/lib/design` |
| Navigation pending overlay / inline spinner | `CardPendingOverlay`, `InlinePendingSpinner` — `@/components/features/layout/nav-pending` |

When a recipe changes here, change its canonical implementation in the same commit
(and vice versa). `.claude/rules/design-system.md` is the enforcement rule.

## Do's and Don'ts

- **Do** derive every offset from the navbar facts (mobile: none / desktop: 64px).
  Audit any `pt-14`/`pt-24`/`top-14` as a bug.
- **Do** add `sm:` step-downs to any text ≥ `text-3xl` and `line-clamp` to any text
  block inside a height-constrained container (heroes, cards).
- **Do** keep `next/image` `unoptimized` for CDN images — the EC2 box must not run
  sharp; the CDN already serves WebP (see `.claude/rules/performance.md`).
- **Don't** hardcode colors (`text-white`, `bg-zinc-900`) except over imagery.
- **Don't** use `100vh` — always `dvh`/`svh`.
- **Don't** use `ssr: false` on hero/LCP elements, and don't lazy-load the LCP image.
- **Don't** invent new font sizes, radii, shadows, or spacing values outside the
  scales above; if a new value seems necessary, update this file first.
- **Don't** modify `src/components/ui/` (shadcn) — compose on top.
