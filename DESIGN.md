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
  viz-1: oklch(0.622 0.161 255.1)
  viz-2: oklch(0.622 0.173 40.1)
  viz-3: oklch(0.621 0.128 163.1)
  viz-4: oklch(0.67 0.143 73.2)
  viz-5: oklch(0.622 0.171 0.8)
  viz-6: oklch(0.529 0.18 142.5)
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

### Data viz palette ({colors.viz-1}…{colors.viz-6})

Charts are the one place the monochrome canvas has to carry several colors at once,
so they get their own palette — six fixed hues (blue, orange, aqua, yellow, magenta,
green), each with a **light step and a dark step** in `globals.css`. The dark column
is the same six hues re-stepped for the dark surface, not an automatic flip.

Rules:

- **Categorical series use `--viz-1…6` in slot order, never cycled.** A 7th series
  folds into a neutral "Other" slice (`--muted-foreground`) — never a generated hue.
  Single-series charts also use `--viz-1`, so one accent-independent palette covers
  every admin chart.
- **The palette is accent-independent**, exactly like {colors.error}/{colors.success},
  and for a concrete reason: an `.accent-*` class rewrites `--chart-1…5` into five
  shades of one hue, which flattens a pie or multi-line chart into indistinguishable
  bands, and those values are tuned for dark (up to L 0.92 for golden), so on a light
  card they are all but invisible. `--chart-*` remains only for accent-tinted
  decorative single-series fills outside admin.
- **Never hardcode a chart color.** Read the token (`useChartColors()` in
  `admin/analytics-charts.tsx` resolves the computed values and re-reads them on
  theme change). Axis ticks, legends and tooltip text wear text tokens
  (`--muted-foreground`, `--popover-foreground`), never a series color.
- **Identity is never color-alone**: ≥ 2 series always ships a legend, and light
  slots 3/4/5 fall under 3:1 against a white card, so a chart using them needs a
  legend or direct value labels (both pies carry a labelled legend with percentages).
- **No dual-axis charts** for new work — two measures at different scales become two
  charts. (The Lambda invocations-vs-duration chart predates this rule.)
- The palette is machine-checkable: lightness band, chroma floor, protan/deutan
  separation, normal-vision separation and contrast-vs-surface all pass in both modes
  for all six slots on the adjacent-pair list. Re-validate before changing a value.

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

**Wide card** — the title sits **below** the card (no in-card title), and the same
`--sig` hairline progress bar sits on the bottom edge. *Planned, not built:* a
**footer line of social proof** on the image (`💬 discussing · 👥 friends`). There is
no friends signal yet, and the discussion count renders below the card
(`DiscussionCountBadge`).

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

## Hover preview & title actions

Cards are **display-only**. Every action on a title lives in ONE shared row,
`TitleActions`, which is rendered in three places with the same order and glyphs.
Spec: `docs/superpowers/specs/2026-10-09-card-hover-preview-overhaul-design.md`.

**Cards** (`MovieCard` poster 2:3, `WideMovieCard` 16:9, both on `movie/card-core.tsx`):
art, the community vote chip (top-right), the bottom-left scoop (personal cluster,
otherwise the quality badge), the `--sig` progress hairline, `CardPendingOverlay`, and
grayscale when watched. No buttons, no hover scale on the card (the scroller's
`overflow-x:auto` clips the y-axis, and the preview now grows out of the card). The
inner image zoom stays because it is clipped by the art. The keyboard focus ring is
drawn **inset** on the art (`ring-inset`), so a scroller can never clip it. Identical on
home, browse, person, library and similar rows.

**The row** — `[leading] · Watched · Watchlist ▾ · Rate · Log · [trailing]`:

| Action | Idle → active glyph | Active fill |
|--------|---------------------|-------------|
| Watched (movie) | `Eye` → `Check` (the "eye/check tick") | brand tint |
| Watched (series) | `ListChecks` + `%` → `Check` when complete; links to the detail page (a series is a watch *position*) | brand tint once tracked |
| Watchlist | `Plus` → `Check`, plus a caret that opens the list picker | brand tint |
| Rate | `Star` → %-filled `PartialStar` + 1–10 score (+ heart) | brand tint |
| Log | `NotebookPen` (movie: "Log to diary", a WATCH; series: "Add a diary note", NOTE-only, because a series-level WATCH derives COMPLETED) | — |

- **hero** variant: the detail action bar, over imagery, with white-alpha recipes.
  Trailer leads, Share trails, and `SeenCluster` supplies the progressive Rate + Diary.
- **compact** variant: the hover preview and the mobile quick-info drawer. These are
  40px round buttons on the themed popover surface using semantic tokens
  (`title-actions/styles.ts`): idle `border-border bg-muted/50`, active
  `border-brand/60 bg-brand/15 text-brand`.
- Behaviour is shared, never per surface:
  - Unmarking a movie with **more than one diary entry asks first** (it deletes them all).
  - Every write goes through `useUserLibrary`, which gates on auth and toasts on
    failure. Analytics fire only after a successful write.
  - Signed-out clicks open the sign-in dialog.

**Hover preview** (desktop fine pointer + keyboard). Do not width-detect touch.
- Trigger:
  - It opens after a 500ms rest on a card. A press in the card cancels it until the
    pointer leaves.
  - Keyboard: a 700ms focus-visible peek. ArrowDown opens it and moves focus inside;
    Esc closes it and returns focus to the card without re-peeking. Shift+Tab on its
    first control closes it and returns to the card; Tab past its last control closes
    it and moves to the next control after the card (it never strands focus at the
    end of `<body>`, where it is portalled).
- Geometry:
  - Width is `clamp(300px, 1.6 × card width, 400px)`, centered on the card.
  - Top sits 8px above the card top, and the preview grows downward. It flips up
    (bottom-anchored to the card) on the **measured** height, and clears the 64px
    navbar + 8.
  - On a viewport too short for it, it pins and the body scrolls inside.
- Surface: `bg-popover border border-border rounded-xl shadow-lg`, `z-50`. Popovers
  and dialogs opened from it portal later, so they stack above it.
- Motion: a ~260ms ease-out grow-out. The clip opens from the card's rect, and a ghost
  of the card's own artwork moves into the art region and fades out. Body rows rise in
  4px with a 40ms stagger. `prefers-reduced-motion`: a 120ms fade only.
- Content order:
  - art (backdrop, title, vote chip, badges, progress hairline). This is the only link.
  - meta (year, runtime/seasons, two genres)
  - overview (`line-clamp-3`)
  - `TitleActions`
  - ratings
  - where to watch (logo links)
  - cast
- States:
  - Loading: art, title and actions render from the list item, and the rest is a
    skeleton.
  - Failure: "Couldn't load the details for this title." with **Retry** and
    **View details**. Never an endless skeleton.
- Dismissal:
  - It closes on pointer leave (200ms grace), page scroll, resize, route change and Esc.
  - Scrolling inside it does not close it.
  - Neither does an open popover or dialog launched from it (`usePreviewHold`).

**Mobile / touch**: a long-press (500ms, 10px slop) on any touch pointer, at any width,
opens the Vaul quick-info drawer with the same `PreviewBody` + `TitleActions`. A tap
still navigates. Back dismisses it (`useHistoryDismiss`).

## Taste profile

Four profile widgets (`src/components/features/profile/widgets/taste-*.tsx`) render
the PUBLIC taste snapshot. They reuse existing tokens only — no new sizes, radii or
colors.

- **Copy is numbers + neutral templates (Fable rule).** Axis endpoints are dimension
  labels ("Mainstream" / "Niche"), captions describe titles ("Favourites average the
  top 26% by popularity"), never the person. No archetypes, no "you are a…".
- **Taste DNA** — one bipolar track per axis: `h-1.5 rounded-full bg-muted` track, a
  1px centre tick (`bg-border`), a `bg-brand/40` fill that grows FROM THE CENTRE to the
  value, and a `size-3 bg-brand ring-2 ring-card` marker. The endpoint nearer the value
  is `text-foreground`, the other `text-muted-foreground`; caption below in the
  metadata recipe. Chosen over a radar: legible at 390px and every axis keeps its own
  caption. Tracks are `role="meter"` with the caption as `aria-valuetext`.
- **Moods & themes** — AI tags as chips (`rounded-full`, `text-xs font-medium`,
  `min-h-10` mobile / `md:min-h-8`), label + tabular count. The three strongest lifts
  use the AI-tag tint (`bg-brand/15 text-brand`), the rest `bg-muted
  text-muted-foreground`. Tap = evidence: Popover (`w-80`) on desktop, Vaul Drawer +
  `useHistoryDismiss` on mobile, a 3-column poster grid of the supporting titles.
- **Your people** — segmented toggle (`rounded-full bg-muted p-1`, active segment
  `bg-card`, depth by lightness step, no shadow), rows `min-h-12` with a `size-10`
  round portrait (initials fallback), role line, metric right-aligned (titles count,
  or a `text-brand` filled star + the shrunk mean on the 5-star scale + rated count).
- **Taste clusters** — medoid posters (`aspect-[2/3] rounded-lg`), label
  (`text-sm font-semibold line-clamp-1`) and "N titles like {medoid}". Mobile fills the
  row (2 or 3 across); `sm:` and up keep the Favorites widget's 4-across poster size.
- **Owner-only hint** below the grid (dashed `rounded-xl border` card) when the profile
  is under the 10-title threshold (progress bar) or hidden by the privacy toggle.
  Visitors see nothing.
- **Taste match** (profile reserved slot, signed-in non-owner only): one `bg-card
  border rounded-xl` card. Left column (`md:w-56`): "Your taste match with {first
  name}" (`text-sm font-semibold`), the score as the one big element
  (`text-3xl sm:text-4xl font-bold tracking-tight tabular-nums`), the evidence line
  in the metadata recipe, then one labelled `h-1.5 rounded-full bg-muted` meter per
  non-null component (`bg-brand` fill, `role="meter"`). Right column: "You both
  loved" poster row (`aspect-[2/3] rounded-lg`, 72–80px wide) and "You'd argue about"
  rows (`min-h-12`, title + both scores as `--brand` stars). Copy describes titles and
  agreement, never the person.

## Recommendations (home)

- Signed-in only, client island under Up Next; guests see nothing (no prompt — the
  Getting Started strip already covers new accounts).
- **For you** — `SectionHeading` with a `Sparkles` brand icon, standard poster
  scroller (`MediaCard`, same card widths as `MovieCarousel`). Each card's subtitle
  is the explanation in ≤ ~20 characters: `Like {title}` or a facet label ("Korean
  thrillers") — the card clamps it to one line at 150px.
- **Because you loved {title}** — up to two rows; the heading's icon slot holds the
  anchor's own poster thumb (`h-8 w-[22px] rounded-md`) instead of a glyph — the one
  distinctive touch, it shows WHICH title the row grows from.
- Cold start (thin history) — the row is titled "Popular in your genres" with one
  metadata-recipe line under it pointing to the diary.
- **Taste twins** — `SectionHeading` + one metadata line, horizontal chips: `bg-card
  border rounded-xl p-3 min-h-12 w-[220px]`, `size-10` round avatar (initials
  fallback), name + "{NN}% taste match" (number in `text-foreground tabular-nums`).

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
| Title action row (watched / watchlist / rate / log) | `TitleActions` — `@/components/features/media/title-actions/title-actions` |
| Title preview content (hover preview + quick-info drawer) | `PreviewBody` — `@/components/features/hover-card/preview-body` (lazy: `lazy-preview-body`) |
| Card core (personal state, overlays, inset focus ring) | `useCardPersonalState`, `CardArtOverlays` — `@/components/features/movie/card-core` |

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
