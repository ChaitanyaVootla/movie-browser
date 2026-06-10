---
paths:
  - "DESIGN.md"
  - "src/app/**/*.tsx"
  - "src/components/**/*.tsx"
  - "src/lib/design.ts"
  - "src/app/globals.css"
---

# Design System: DESIGN.md is Law

`DESIGN.md` (repo root, Google Labs design.md format) is the single source of truth
for all UI: tokens in its YAML frontmatter, recipes and layout rules in its body.
This rule exists to keep code and DESIGN.md from drifting apart.

## The contract

1. **Before any UI change**, read the relevant DESIGN.md section (Typography, Layout,
   Shapes, Components, Do's and Don'ts). Build to it, not to memory or to whatever
   the nearest file happens to do.
2. **If a value you need doesn't exist in DESIGN.md** (a new font size, radius,
   spacing step, offset, component recipe), update DESIGN.md **first** — token in the
   frontmatter, rationale in the body — then implement. Never invent values inline.
3. **If you find code that contradicts DESIGN.md**, the code is the bug (unless the
   design rationale is clearly stale — then fix DESIGN.md and say so in the commit).

## Use the primitives, don't retype the recipes

Canonical implementations live in code — import them instead of copying class strings:

| Recipe | Canonical source |
|--------|------------------|
| Page shell (non-hero pages: `min-h-screen pt-4 md:pt-20 pb-12 px-4 md:px-8 lg:px-12`) | `<PageMain>` from `@/components/features/layout/page-main` |
| Section heading (h2: `text-xl font-semibold tracking-tight`) + header row with optional action | `<SectionHeading>` from `@/components/features/layout/section-heading` |
| Sticky in-page bar, hero tagline, overline label, page padding | class constants in `@/lib/design` |

If a new pattern appears 3+ times, promote it: add a constant/component, document the
recipe in DESIGN.md Components, and add a row here.

Gotchas when composing constants with `cn()`:

- **Order matters with tailwind-merge**: a later `py-2` overrides an earlier
  `pt-[calc(…)]` from a constant. Put the more specific constant *after* the generic
  axis class: `cn(STICKY_BAR, "px-4 py-2", STICKY_BAR_SAFE_AREA)`.
- Full-bleed pages (edge-to-edge carousels) use `<PageMain className="px-0 md:px-0
  lg:px-0">` and pad non-bleed sections individually with `PAGE_PADDING_X`.

## Load-bearing layout facts (memorize these two)

- **Mobile (< md) has NO top navbar** — navigation is the bottom nav (`h-14` + safe
  area). Mobile pages need no navbar offset; mobile sticky bars stick at `top-0`
  (with `pt-[calc(env(safe-area-inset-top,0px)+0.5rem)]`).
- **Desktop (md+) navbar is exactly 64px** (`h-16`, fixed, z-50). Desktop offsets:
  pages `md:pt-20`, sticky bars `md:top-16`, fixed panels `top-16 h-[calc(100dvh-4rem)]`.

Any `pt-14`, `top-14`, `pt-24` (outside `/admin`) is a bug — fix it on sight.

## Hard rules (from DESIGN.md Do's and Don'ts)

- `dvh`/`svh`, never `vh`, for full-height elements.
- No hardcoded colors (`text-white`, `bg-zinc-*`) except over imagery/video.
- Text ≥ `text-3xl` needs `sm:`-first step-downs; text inside height-capped
  containers (heroes, cards) needs `line-clamp-*`.
- Touch targets ≥ 40px on mobile.
- `src/components/ui/` (shadcn) is read-only — compose on top, never edit.
- No new radii/shadows/sizes outside the DESIGN.md scales.

## Verifying UI changes

Static checks are not enough — render it. Screenshot affected pages at 390×844
(mobile, `isMobile: true`) and 1440×900 via Playwright (run scripts from the repo
root or `@playwright/test` won't resolve; see `.claude/rules/performance.md` for
gotchas). Check against the before state, not just "looks fine".

See also: `.claude/rules/theming.md` (color variables, style/accent variants),
`.claude/rules/server-components.md` (RSC patterns), `.claude/rules/performance.md`
(image/LCP constraints that override naive design "fixes").
