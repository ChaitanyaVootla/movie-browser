# Profile Widget Dashboard — Design

**Status:** approved to build (owner out-of-loop; build thoroughly, leave in working tree for review, do NOT push).
**Branch:** `feat/social-phase0`.
**Supersedes:** the separate `/settings` profile editor and the hardcoded stacked
profile sections (Four Favorites, stats band, taste, lists, reviews) — these
become registered widgets in a customizable grid.

## 1. Thesis

The public profile (`/u/[username]`) becomes a **customizable widget dashboard**.
A profile is no longer a fixed template — it's a grid of modular widgets the owner
arranges and resizes. New/unedited profiles get a sensible **default layout**
(mostly empty for new users — by design, a prompt to *fill it by using the site*).
Visitors who see a beautifully-specced profile are encouraged to build their own.
Generic + extensible: adding a new widget type (country map, Wrapped card, poster
board, taste-compat) later = implement one component + register it. Nothing else
changes.

## 2. Hard constraints (why the architecture is shaped this way)

1. **`/u/[username]` is ISR-cached, SEO-critical, LCP-sensitive.** The public
   render must be **server-rendered static HTML** with no viewer data and no
   client-only drag grid. (Edge-cache invariant — `.claude/rules/social-features.md`.)
2. **Owner-only UI hydrates client-side** via the existing `ProfileViewerProvider`
   (`isOwner`) — no owner/account data in cacheable HTML.
3. **Widgets render from the cacheable snapshot** (`user_stats` + the public
   profile DTO). No per-render DB/LLM/auth. New stats are precomputed into the
   snapshot.
4. **DESIGN.md is law** (tokens, `@/lib/design`, mobile-first, touch targets,
   accent theming, the `--success` token). No edits under `components/ui/`.

## 3. The dual-render model (crux)

| | Public / visitor view | Owner edit mode |
|---|---|---|
| Renderer | **Static CSS grid**, server component | **Grid library**, client-only |
| Source | saved layout (or default) | same layout, made interactive |
| Loaded for | everyone (cacheable) | owner only, on "Customize" click |
| Drag/resize | no | yes (OOTB from lib) |
| Bundle cost to visitors | zero | n/a |

The grid library's `{x,y,w,h}` map 1:1 to CSS grid placement
(`grid-column: <x+1> / span <w>; grid-row: <y+1> / span <h>`), so the static
render and the editor stay visually identical. The library is dynamically
imported **only in edit mode** so visitors never download it.

**Library:** a mature draggable+resizable React grid, React-19-safe, edit-mode
only. (Choice finalized from research: react-grid-layout vs gridstack — pick the
React-19-compatible one; see Implementation Notes. If neither is clean on React
19, fall back to `@dnd-kit` + a CSS-resize handle.)

## 4. Data model

### 4.1 Layout config — `users.metadata.profile.layout` (JSON, NO migration)

```ts
interface ProfileLayout {
  v: 1;                       // schema version
  cols: number;               // grid columns the layout was authored at (e.g. 12)
  widgets: WidgetInstance[];
}
interface WidgetInstance {
  id: string;                 // stable instance id (nanoid)
  type: WidgetType;           // registry key
  x: number; y: number;       // grid coords (top-left), in `cols` units
  w: number; h: number;       // span
  config?: Record<string, unknown>; // instance params (validated per-type)
}
```

- Stored in the existing `metadata` Json envelope under `profile.layout`. No
  schema change (mirrors `profile.accent`, `profile.backdrop`, …).
- Absent layout → server generates the **default layout** from the profile's
  available data. Customization is a pure override.
- `config` makes widgets parameterized & repeatable (e.g. multiple poster boards
  with different titles; a stat tile bound to a chosen metric).

### 4.2 Widget registry

```ts
interface WidgetMeta {
  type: WidgetType;
  category: "stat" | "chart" | "showcase" | "text";
  title: string;             // palette label
  defaultSize: { w: number; h: number };
  minSize: { w: number; h: number };
  maxSize?: { w: number; h: number };
  /** Is this widget meaningful for this profile? (hide from palette / default if not) */
  isAvailable: (data: ProfileWidgetData) => boolean;
  configSchema?: ZodSchema;  // validates WidgetInstance.config
}
```

Two parallel maps keep the server bundle clean:
- `WIDGET_META: Record<WidgetType, WidgetMeta>` — pure data, safe everywhere.
- `WIDGET_RENDER: Record<WidgetType, (props) => ReactNode>` — server components.

A widget render component signature: `({ data, config }) => ReactNode`, where
`data: ProfileWidgetData` is the full cacheable bundle (profile DTO + stats).
Widgets pick what they need; they never fetch.

### 4.3 v1 widget set

| type | category | renders | size (w×h /12-col) |
|---|---|---|---|
| `stat.films` `stat.episodes` `stat.hours` `stat.streak` `stat.rewatches` `stat.following` | stat | count-up tile | 3×1 |
| `chart.ratings` | chart | 1–10 histogram | 4×2 |
| `chart.genres` | chart | top-genre bars | 4×2 |
| `chart.decades` | chart | decade bars | 4×2 |
| `chart.countries` | chart | **world map** + top countries (NEW) | 6×3 |
| `chart.activity` | chart | monthly activity bars (NEW) | 6×2 |
| `showcase.favorites` | showcase | poster board (configurable N, default 4) | 6×2 |
| `showcase.watching` | showcase | currently-watching shelf | 6×2 |
| `showcase.lists` | showcase | pinned lists | 6×2 |
| `showcase.reviews` | showcase | review cards | 12×3 |
| `text.note` | text | freeform short note (NEW, owner-set) | 4×1 |

Four Favorites is now just `showcase.favorites` with `config.limit=4` — no longer
special-cased.

### 4.4 Data-layer additions (precomputed → snapshot/DTO)

Extend `StatsSnapshot` (`stats-compute.ts`) + `getUserStatsSnapshot` SQL
(`stats.ts`) + `PublicProfileDTO` (`types/social.ts`) + assembly
(`public-profile.ts`) with:

- `countries: { code: string; name: string; count: number }[]` — from
  movie/series production/origin countries joined per watch event. (Schema
  relations confirmed via research; ISO code + name.) Powers the map widget.
- `currentStreakDays: number` — **real** value (walk back from today over
  `datedDays`; currently hardcoded 0).
- `rewatchCount: number` — already computed in snapshot; surface in DTO.
- `monthlyActivity: { month: string; count: number }[]` — already `byMonth`;
  surface last-12 in DTO.

All cheap, computed once on snapshot recompute (dirty/24h), rendered from cache
on public profiles. (Honest Wrapped rule preserved: BACKFILL/IMPORT handling
unchanged.)

## 5. Components & flow

```
app/u/[username]/page.tsx (server, ISR)
 ├─ ProfileHero (server; + owner Edit/Customize toggle = client island)
 ├─ ProfileViewerProvider (client ctx: isOwner/editMode)
 │   ├─ ProfileDashboard (server)  ← reads layout||default, renders STATIC grid
 │   │     └─ for each WidgetInstance: WIDGET_RENDER[type]({data,config})
 │   └─ ProfileDashboardEditor (client, owner+editMode only, dynamic import)
 │         ├─ <GridLib> over the same widgets (drag/resize/add/remove)
 │         ├─ Widget palette (WIDGET_META filtered by isAvailable)
 │         └─ Save → updateProfileLayoutAction(layout) → revalidate
 └─ ProfileOwnerSettings (client, owner: button → modal/slim page)
       account(username) · privacy · blocked/muted · import/export
```

- **Edit toggle:** the hero "Edit profile" button (owner) becomes
  "Customize" → flips `editMode` in `ProfileViewerProvider`. In edit mode the
  static grid is replaced by the editor (client) over identical widgets.
- **Persistence:** `updateProfileLayoutAction(layout)` validates (zod: known
  types, in-bounds coords, per-type config) via `auditedTransaction`, writes
  `metadata.profile.layout`, `revalidatePath('/u/<username>')`.
- **Settings modal:** account/privacy/blocked/data leave `/settings`; a
  "Settings" button (owner, in hero or a menu) opens a `Dialog` (desktop) /
  `Drawer` (mobile) — or a slim `/settings` that now ONLY holds these. `/settings`
  also remains the **username-claim bootstrap** for accounts with no username
  yet (no profile URL exists until claimed) and otherwise redirects to the
  owner's profile.

## 6. Default layout & "rewarding to fill"

- `buildDefaultLayout(data)` places the widgets that have data (stat tiles always;
  favorites/watching/charts/reviews when non-empty) in a tasteful arrangement
  (≈ today's bento).
- **Empty widgets are opportunities, not voids:** for the owner, an empty
  widget renders a CTA ("＋ Pick your favorites", "Log something to fill this")
  linking to the action; for visitors, empty widgets are simply omitted.
- The setup/progress card stays as an owner-only widget/banner driving the fill
  loop; completion grows as the user logs, rates, reviews, customizes.

## 7. Invariants preserved

- No `auth()`/`headers()` in the public render tree; owner state via the client
  context only.
- Country/stat data from the cacheable snapshot; no per-render compute.
- `updateProfileLayoutAction` runs through `auditedTransaction`; revalidates the
  single path (single-path CloudFront invalidation is the documented prod
  follow-up).
- DESIGN.md tokens/primitives; accent scoping unchanged; `dvh`, safe-area, 40px
  touch targets in edit controls.

## 8. Phasing (build order)

1. **Data layer** — snapshot/DTO additions (countries, currentStreak,
   rewatchCount, monthly) + tests.
2. **Registry + static render** — types, `WIDGET_META`/`WIDGET_RENDER`, refactor
   bento widgets into the registry, `ProfileDashboard` static grid +
   `buildDefaultLayout`. (Profile looks ~same, now layout-driven.)
3. **Country map widget** + monthly-activity widget.
4. **Edit mode** — grid lib, palette, `updateProfileLayoutAction`, edit toggle.
5. **Settings modal** + `/settings` repurpose + link updates.
6. **Verify** — typecheck, lint, unit tests, Playwright screenshots (visitor +
   owner + edit mode, mobile + desktop).

## 9. Out of scope (future, registry-ready)

Taste-compatibility widget (phase 2 slot reserved), Wrapped share-card widget,
per-breakpoint layouts (v1 stores one desktop layout; mobile reflows by order),
collaborative/embeddable profiles, drag between breakpoints, widget marketplace.

### Planned: a real "Recent activity" FEED widget (TODO — deferred 2026-06-13)

`chart.activity` is now **"Watch activity"** — a GitHub-style daily heatmap
(~26 weeks of public dated watches) + a side list of recent watched titles
(`widgets/watch-activity.tsx`; data: `PublicProfileDTO.dailyActivity` +
`recentWatches`, assembled in `public-profile.ts` from non-private `watch_events`).

Still wanted (a SEPARATE widget, not the heatmap): a chronological **activity
feed** interleaving event types — recent watches **+ reviews written + lists
created/updated + ratings** — as a scannable timeline. Public + privacy-
respecting; a new `feed.activity` widget reading a unioned, bounded, query-time
feed (NO fan-out writes, same rule as the social feed). Build after the
dashboard settles.

## 10. Implementation notes (from research, 2026-06-13)

**Stack:** Next **16**.1.0, React **19**.2.3, Yarn 4.9.2.

**Grid library: `react-grid-layout` v2.2.3** (`yarn add react-grid-layout`,
`yarn add -D @types/react-grid-layout`). Peer `react >= 16.3.0` → installs clean
on React 19; StrictMode-compatible. Use `WidthProvider(Responsive)`, items are
`{i,x,y,w,h}` (i = widget id). Key API: `layouts`/`cols`/`breakpoints`,
`rowHeight`, `isDraggable`/`isResizable`, `onLayoutChange(layout, all)`,
`draggableHandle`, `compactType`, `isBounded`, per-item `minW/maxW/minH/maxH`.
Add = push `{x:0,y:Infinity,...}`; remove = filter. **Load via
`next/dynamic(... ,{ssr:false})`** so it never enters the RSC/ISR tree or the
visitor bundle. Import its CSS (`react-grid-layout/css/styles.css`,
`react-resizable/css/styles.css`) inside the client editor module only.
Breakpoints: lg1200/md996/sm768/xs480/xxs0; cols 12/10/6/4/2.

**Country data:** `Country { code (ISO alpha-2, PK), name }`;
`movie_countries(movie_id,country_code,type)` default PRODUCTION;
`series_countries(series_id,country_code,type)` default ORIGIN; `CountryType`
enum ORIGIN|PRODUCTION; junctions are reliably populated by hydration. Add to
`stats.ts` queries, parallel to the genre agg:
`LEFT JOIN movie_countries mc ON mc.movie_id=m.id LEFT JOIN countries c ON c.code=mc.country_code`
+ `COALESCE(array_agg(DISTINCT c.name) FILTER (WHERE c.name IS NOT NULL),'{}') AS countries`
(GROUP BY unchanged); same for series via `series_countries`. Thread `countries:
string[]` through `MovieEventRaw`/`fromMovie`/`fromSeries` → `StatsEventRow` →
`computeStats` rollup → `StatsSnapshotSchema`. ISO code AND name both available;
`country-list` npm pkg already a dep for code→name in JS. Keep `DISTINCT…FILTER`
to avoid `{NULL}` and row-multiplication.

**`/settings` link sites to update for the settings-modal move:**
`auth/user-menu.tsx:154` (header link, username-fallback) + `:201` (Settings
item); `layout/mobile-bottom-nav.tsx:71` (Profile tab fallback) + `:81`
(Settings tab); `profile/owner-actions.tsx:21` (Edit profile); programmatic
`settings/username-claim-prompt.tsx:56` (`router.push`); `profile-setup-card.tsx:49-51`
(3 hrefs, one with `#four-favorites` anchor → needs an open-to-section mechanism);
`/settings/import` child route must stay reachable. `/settings` REMAINS the
fallback/bootstrap for accounts without a username (no profile URL exists yet).
