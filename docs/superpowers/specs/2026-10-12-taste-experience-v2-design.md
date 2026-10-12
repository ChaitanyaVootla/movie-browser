# Taste Experience v2 — critique + redesign (home For-you, profile taste, Cue)

Date: 2026-10-12 · Author: taste-design (lead product designer) · Base: `next` @ 2960bd84
Status: design spec, ready to split into 3 parallel workstreams (§7).
Inputs: `DESIGN.md`, `.claude/rules/{taste-profile,design-system,social-features,ai-agent,performance}.md`,
specs `2026-10-09-taste-profile-design.md`, `2026-10-09-taste-recommendations-design.md`,
`2026-10-10-taste-vector-upgrades.md`; live dev server screenshots in
`scratchpad/design/shots/` (`d-*` = 1440×900, `m-*` = 390×844 @2x).

The brief, verbatim: "the taste ui and feel its not that great and is not that
interactive or fun … the for you section in home its great but a little confusing the
title says since i liked something but there is like something in the subtext …
make the section more interactive … ai powered options … give ai tools to get taste
access and help pick things".

---

## 0. TL;DR

The taste pipeline is good and the privacy model is right. The **presentation is a
report, not a product**: eight meters, ten chips, six rows of names and three posters,
all in identical `WidgetCard`s, with exactly one hidden interaction (tap a mood chip).
On the home page the recommendations are indistinguishable from "Trending Movies"
except for a one-line subtitle — and that subtitle contradicts the row heading on
every single card.

v2 keeps the maths and changes four things:

1. **One "why" model.** A row heading names a SET of anchors; the small tag under a
   card names WHICH ONE. Nothing under a card may name a title that is not in its
   row's heading. The cluster rows are rebuilt so this is true by construction.
2. **Every rec is actionable in place**: Not for me (undo, persisted, feeds the
   negative centroid), More like this (spawns a seeded row), Why this? (sheet), a
   **Tune bar** of chips that re-rank the same pool, Surprise me, and a 60-second
   **calibration deck** for cold-start users.
3. **The profile taste block becomes one Taste card** (posters + a five-axis strand +
   top moods) where every element is a door — tap a poster → that cluster's titles,
   tap an axis end → the titles at that end, **Compare with me** overlays the
   visitor's own axes on the same strand — plus Moods and People as explorable
   widgets. Numbers-and-titles copy stays; the Fable rule is untouched.
4. **Cue gets real taste access**: five deterministic tools (`get_taste_detail`,
   `explain_title_fit`, `compare_taste`, `steer_recs`, `record_rec_feedback`) and
   one closed-vocabulary `[TUNE:…]` tag that lets a chat sentence re-tune the home
   row. AI runs only inside a user's chat turn — never on render.

---

## 1. Critique (what I saw)

Data caveat first: the dev DB uses synthetic embeddings (taste-profile.md), so the
*quality* of a given anchor ("Forrest Gump ← Pride & Prejudice") is not evidence. The
*structure* of the UI is, and that is what is critiqued below.

### 1.1 Home — "For you" row (`d-home-foryou.png`, `m-home-foryou.png`)

- **It looks like every other row.** Same poster card, same scroller, same heading
  recipe; the only taste signal is a `Sparkles` glyph and a grey one-liner under each
  card. A user scrolling past Trending → For you → Trending Trailers has no reason to
  slow down. Spotify's "Made for you" shelf and Netflix's "Top picks for {name}" at
  least earn a distinct frame; this earns nothing.
- **The subtitle vocabulary is wrong.** "Like Pride & Prejudice" is ambiguous — is it
  a verb (an instruction: like this!), an adjective (similar to), or a reason? Users
  reading fast read the first meaning. And it is one anchor by cosine, so a 20-card row
  shows 20 *different* anchors, none of which the heading mentions.
- **Zero actions.** No dismiss, no "why", no more-like-this, no reshuffle. The only
  way to influence the row is to go rate things elsewhere and come back tomorrow. A
  recommendation surface with no feedback loop is a billboard. The hover preview
  (`d-home-rec-hover.png`) is excellent — TitleActions, cast, ratings — but it does not
  know the card is a recommendation: it shows no reason and offers no rec actions.
- **Cold start is a dead end.** "Popular in your genres" + a sentence pointing to the
  diary. The user has to leave the surface to improve it.

### 1.2 Home — "Because you loved {X}" rows (`d-home-because.png`, `m-home-because.png`)

This is the confusion the user reported, and it is systemic, not a copy nit. Captured
card text from the live row:

| Row heading | Card subtitles in that row |
|---|---|
| Because you loved **The Matrix** | Like 2001: A Space Odyssey · Like Blade Runner · Like 2001 · Like The Prestige · (none) · (none) · More dramas · Like The Prestige |
| Because you loved **Pulp Fiction** | Like Blade Runner · Like Se7en · Like Se7en · Like Se7en · More thrillers · Like Se7en · More thrillers · (none) |

Not one card agrees with its heading. Cause (spec §3.6–3.7): the row is anchored on the
cluster **medoid**, but each item's explanation picks the user's **single best anchor
over all 100 positives** — which is almost never the medoid. Two "why" signals, two
different algorithms, one row. The code even knows it: `explanationText` suppresses the
subtitle only when the item's anchor *happens* to equal the row anchor.

Second problem: the medoid is a poor row name. The "Pulp Fiction" row holds Shutter
Island, Memento, Get Out, Hereditary, The Shining, Psycho, The Conjuring — a thriller/
horror cluster whose medoid happens to be Pulp Fiction. Users will not believe that row.
Third: the row heading's poster thumb (the "one distinctive touch") is 22px wide and
reads as an icon, not as a title.

### 1.3 Profile — Taste DNA (`d-ada-dna.png`, `m-ada-dna.png`)

- Five identical hairline meters with 12px markers, grey captions, inside the same
  card as "Decades" and "Where your films are from". It reads like a settings panel.
- **Redundant with the charts above it**: "Focused ↔ Eclectic — Favourites span 11
  genres" sits under a Top-genres bar chart; "Classic ↔ New — median 2010" sits under
  a Decades chart. The widget restates two charts and adds three meters.
- Nothing is tappable. "Favourites average the top 27% by popularity" — which
  favourites? The evidence is one tap away in the data and infinitely far in the UI.
- The strongest idea here — the fill grows from the centre, so "how far from
  typical" reads at a glance — is lost at 1.5px height.

### 1.4 Profile — Moods & themes (`d-ada-moods.png`, `d-ada-mood-popover.png`, `m-ada-mood-drawer.png`)

- The evidence popover/drawer is the **one good interaction on the page**: a title,
  "11 titles, 3.2× the catalog rate", a 3-column poster grid. Keep it. Make it the
  model for everything else.
- But the chip set is padded with **neutral mid-scale values**: "Medium intensity 12",
  "Mixed tone 12", "Steady pacing 13", "Emotionally balanced 17". These are the
  *middle* of a scale — they say nothing about this person's taste, and because they
  have high counts they take tinted top-3 slots ("Medium intensity" is tinted brand on
  Ada's profile). Lift should already de-emphasise them; display must drop them.
- No affordance says "tap me". Chips look like metadata chips elsewhere in the app,
  which are not tappable.

### 1.5 Profile — Your people (`d-ada-people.png`, `m-ada-people.png`)

Structurally fine (segmented toggle, portraits, right-aligned metric). Inert: a row
links to the person page, but the interesting question — *which* four Nolan titles —
has no answer here. "Highest rated" shows a brand star + "4.5 (3)" with a `title`
tooltip only; on touch that information does not exist.

### 1.6 Profile — Taste clusters (`d-ada-clusters.png`, `d-own-profile-full.png`)

- The cluster **label is a bare top facet**, so Ada's clusters read "Scientist /
  Adventure / Sci-Fi & Fantasy" — "Scientist" is a keyword, not a cluster name, and
  next to a genre it looks like a bug. Local Tester's second cluster renders
  "Artificial…" (line-clamp-1 on a 2-across grid) — the label is unreadable.
- 2 clusters in a 6-col card at 4-across posters leaves the right half empty.
- "10 titles like Interstellar" is the best copy on the page — and the 10 titles are
  not reachable. The medoid links to the movie page; the cluster itself is a dead end.

### 1.7 Profile — Taste match (`d-ada-match.png`, `m-ada-match.png`, `m-ada-match-2.png`)

- Placed **last on the page**, under Lists and Reviews. A signed-in visitor sees the
  single most social thing the profile has only if they scroll past everything.
- Headline 54% sits above three meters reading 56 / 68 / **28%**. "Overall taste 28%"
  as a sub-score of a 54% headline reads as a contradiction; it is the centered-cosine
  rescale, but no user can know that. Three bars that look like three scores for one
  thing.
- No action. No Follow here, no "find us something to watch", no way to look at the
  comparison on the axes. It is a scorecard with no game.

### 1.8 Profile — Owner hint (`taste-owner-hint.tsx`)

Dashed card, a sentence, a progress bar "7 of 10". It tells the owner to go rate
things, somewhere else. The hint should *be* the fastest way to rate things.

### 1.9 Home — Taste twins strip

Did not render for the test user (no public twin ≥ 40% in dev — expected). When it
does render it is a row of 220px chips with a name and "NN% taste match" and nothing
to do but navigate. No shared titles, no Follow.

### 1.10 Cross-cutting

- **No hierarchy among the taste widgets.** DNA, Moods, People, Clusters are four
  equal cards among nine other equal cards. The profile has no "this is who I am"
  moment; Letterboxd's Four Favourites is that moment there, and here the taste data
  could be that moment and isn't.
- **No shareable artifact.** Spotify Wrapped, Stats.fm and Letterboxd Year-in-Review
  all end in a card you can post. Taste is the most shareable thing on this site and it
  cannot leave the page.
- **Cue is blind to taste on every surface.** The idle bubble offers "What's trending
  right now?" to a user whose home row has 20 personal picks under it. The detail page
  prompts are generic sass; none asks "would I like this?". The match card cannot ask
  Cue to find a film for two people.

---

## 2. Design principles for v2

1. **Heading = the set, tag = the member.** A row's heading names every anchor its cards
   may cite. A card's tag names one of them. No other "why" text exists on a card.
2. **Every number is a door.** A meter, a chip, a poster, a count: tapping it shows the
   titles behind it. If we cannot show the titles, we do not show the number.
3. **Feedback where the pick is.** Not for me / More like this / Why this? live on the
   recommendation, with undo, and change the row immediately. Persisted, so tomorrow's
   row remembers.
4. **Spend boldness once per surface.** Home: the **Tune bar** (chips that re-rank live).
   Profile: the **Taste card** (posters + axis strand, every element tappable, Compare
   overlay). Everything else stays quiet and DESIGN.md-standard.
5. **Numbers and titles, never adjectives about people.** The Fable rule stands: axis
   endpoints are dimension labels, captions are templates about titles, the owner's own
   chat may discuss their taste but the UI never says "you are a…". Rejected on these
   grounds: Wrapped-style archetypes ("Night Owl", "Genre Hopper"), AI-written taste
   blurbs on the profile, "personality" radar charts.
6. **Motion answers an action.** Dismiss collapses the card; a seeded row grows in;
   compare dots travel from centre to value once. No entrance stagger on rows, no hover
   choreography. CSS transitions / WAAPI only; `m` from framer-motion only where a file
   already imports it. `prefers-reduced-motion`: fades only.
7. **Cheap by construction.** Tune, Surprise, Not for me and Why re-use the cached
   160-candidate pool (a re-rank, no new ANN). More like this is one `annSearch`. Cue's
   taste tools are deterministic reads. Nothing new runs on a render or crawler path.
8. **Privacy as before.** Home = FULL scope, owner only. Anything another person can see
   (Taste card, Compare overlay, match, twins, Cue `compare_taste`) = PUBLIC scope on
   BOTH sides. The compare overlay plots the *visitor's* PUBLIC axes, not FULL — so the
   picture is symmetric and a visitor cannot leak their own private watches to a
   screenshot.

Design-plan self-review (frontend-design skill): the first draft of this plan reached
for a radar chart, a six-hue cluster palette, a swipe-only deck, and sparkle icons on
every rec card. All four are the generic defaults for this brief. Radar → axis strand
(legible at 390, each axis keeps its caption, overlays read cleanly). Palette → one
accent, posters carry colour. Swipe-only → buttons primary, swipe as enhancement.
Sparkles on cards → one Cue pill per surface. What stays bold: the Tune bar and the
Taste card.

---

## 3. Home — For-you v2

### 3.1 The "why" model (fixes the heading/subtitle conflict)

`RecExplanation` v2 (`src/lib/taste/recommend-types.ts`, owner A):

```ts
export type RecExplanation =
  | { kind: "because"; anchor: RecTitleRef; cos: number; alsoNear: RecTitleRef[]; facets: string[] } // alsoNear ≤ 2, facets ≤ 2
  | { kind: "facet"; label: string; facets: string[] }
  | { kind: "seed"; seed: RecTitleRef; cos: number }        // "More like X" rows
  | { kind: "popular"; label: string };                     // cold-start / tune top-up

export interface RecRowDTO {
  id: string;                                   // "for-you" | "cluster-<n>" | "seed-<m|s>:<id>" | "calibration"
  kind: "for_you" | "because" | "seed" | "calibration";
  anchors: RecTitleRef[];                       // heading set (because: ≤3 cluster members; seed: [seed]; else [])
  label: string | null;                         // cluster facet label (fallback heading)
  items: RecItemDTO[];
  tune: TuneParams | null;                      // the tune that produced this row (for_you only)
}
```

Rules, enforced in `buildRecRows` + a unit test:

- **Because rows**: explanations are computed against the **cluster's member anchors
  only**. An item whose best in-cluster cosine < `REC_BECAUSE_MIN_COS` is dropped from
  the row (it has nothing truthful to say). `anchors` = the ≤3 members that anchor the
  most items, ordered by items anchored, ties by weight. Rows under `REC_CLUSTER_ROW_MIN`
  are dropped as today.
- Heading copy: 1 anchor → "Because you loved **The Matrix**"; 2 → "Because you loved
  **The Matrix** & **Blade Runner**"; 3 → "Because you loved **The Matrix**, **Blade
  Runner** & **Inception**". Mobile (`sm:hidden` variant): "Because you loved **The
  Matrix** & 2 more". Heading icon slot: the anchors' poster thumbs **overlapped**
  (`h-8 w-[22px]`, `-ml-2` after the first, `ring-2 ring-background`) — the plural is
  visible before the text is read.
- **For-you row**: each card carries an **anchor tag** (§3.2). The heading is "For
  you" with a sub-line "Built from {N} titles you rated, hearted or logged" (metadata
  recipe; N = `positiveCount`, FULL scope — owner-only surface).
- **Invariant test**: for every row, every rendered tag's title ∈ `row.anchors` (because/
  seed rows) — or the row is `for_you`. `for-you-section.test.tsx` asserts it on fixture
  DTOs; `recommend.test.ts` asserts the builder never emits a because-row item whose
  anchor is outside the cluster.

### 3.2 Card anatomy in a rec row

Cards stay `MediaCard` (display-only, unchanged — do not touch `movie-card.tsx`; the
cards-polish stream owns it). The rec-specific layer is the **wrapper** the row already
renders around each card (`RecRow` → `<div className="flex-shrink-0">`):

```
┌──────────────┐
│ ×  (hover)   │  ← Not for me: 28px round, top-left, fine-pointer hover/focus only (`@media (hover:hover)`)
│   poster     │
│              │
└──────────────┘
 Title (card's own)
 ▣ The Matrix          ← anchor tag: 14×21 poster thumb + title, text-xs muted, one line, TAPPABLE
```

- **Anchor tag** (`for-you/anchor-tag.tsx`): `button` (40px tall hit area via
  `py-2 -my-2`, `min-h-10` on mobile), content `inline-flex items-center gap-1.5`,
  thumb `h-[21px] w-[14px] rounded-[2px] overflow-hidden bg-muted` — the only new
  radius, and it is sub-scale: record it in DESIGN.md as "thumb-xs" (2px) under
  Recommendations. Text `text-xs font-medium text-muted-foreground line-clamp-1`;
  `because` → "{anchor.title}", `facet` → "{label}" with a `Tag` glyph instead of a
  thumb, `seed` → never rendered (heading carries it), `popular` → "{label}" with
  `TrendingUp` glyph. In because/seed rows the tag renders ONLY when the item's anchor
  is not the first heading anchor (so it adds information, never contradicts).
- Tap/click the tag → **Why sheet** (§3.3). `aria-label="Why this pick"`.
- The MediaCard `subtitle` prop is **no longer used** by rec rows.
- **Not for me** (`for-you/not-for-me-button.tsx`): `size-7 rounded-full bg-black/60
  text-white/90 hover:bg-black/80` over imagery (allowed), icon `X`, `aria-label="Not
  for me"`, appears on wrapper hover/focus-within (opacity transition 120ms). On
  touch it lives in the Why sheet only. This is a deliberate, documented exception to
  "cards are display-only": it is an action on the *recommendation*, not on the title,
  and it is rendered by the rec wrapper, not the card. Add the sentence to DESIGN.md →
  Recommendations.

### 3.3 Why sheet (desktop Popover / mobile Vaul Drawer + `useHistoryDismiss`)

Opened from the anchor tag (both pointer types) and from the row-heading thumbs
(opens the row-level variant). One component, `for-you/rec-why-sheet.tsx`, lazy
(`next/dynamic`, `ssr:false` is fine — it is never above the fold).

Item variant content, top to bottom (all from the DTO, zero network):

```
Why this pick
┌────────────────────────────────────────────────┐
│ ▣ The Matrix        closest of your favourites  │  ← anchor row: 36×54 thumb, title, cos as "very close / close / near" bucketed label + number "0.61"
│ ▣ Blade Runner · ▣ Inception   also near        │  ← alsoNear (≤2), small thumbs
│ Shares: Cyberpunk · Science Fiction             │  ← facets the item carries that are lifted for you (≤2 chips, muted)
├────────────────────────────────────────────────┤
│ [ More like this ]   [ Not for me ]             │  ← two shadcn Buttons, secondary + ghost(destructive text)
│ Ask Cue: "Why would I like The Terminator?"     │  ← CueEntryButton (C), message prefilled, opens chat
└────────────────────────────────────────────────┘
```

Copy: cosine buckets (centered space, `tasteWindow`-relative): ≥0.5 "very close",
0.35–0.5 "close", 0.3–0.35 "near". Numbers stay visible (`tabular-nums`) so the honest
value is one glance away. Facet row omitted when empty. "Not for me" uses
`text-destructive` (brand is red — DESIGN.md caveat). Row-heading variant lists the
≤3 anchors + "and {size − 3} more titles in this group" + a "Show all {size}" link that
expands to the member poster grid (owner-only data — FULL scope is fine here, this is
the owner's home).

### 3.4 Actions and their behaviour

| Action | Where | Behaviour | Persistence |
|---|---|---|---|
| **Not for me** | wrapper hover button; Why sheet | Card collapses (WAAPI: `width → 0`, `opacity → 0`, `margin → 0`, 220ms ease-out; reduced-motion: instant). Toast "Removed from your picks · **Undo**" (8s). Row re-flows; if a row drops under 4 items it hides with the same collapse. | `recordRecFeedback({mediaType,id,kind:"DISMISS",rowId,anchorKey})`. Undo → `undoRecFeedback`. Dismissed ids join `fetchRecExclusions` and feed the negative centroid at `W_DISMISS = −0.75` (decayed). Also `rec_dismiss` / `rec_undo` analytics. |
| **More like this** | Why sheet; also the hover preview's existing "similar" affordance is NOT changed | A **seeded row** "▣ More like {Title}" is inserted directly **below the current row** (grid-rows `0fr → 1fr` 260ms + fade). Max 2 seeded rows at once (oldest replaced, with a 150ms fade). Heading trailing: `X` "Remove row". | `getMoreLikeThis({mediaType,id})` → `annSearch(similarTo seed)` ×2 tables, exclusions + dismissals inside the scan, `blendQueryTaste` (0.65 seed / 0.35 taste), `notAdult`, vote floor, 12 items, explanation `seed`. In-process cache 10 min keyed `userId:seedKey:tasteComputedAt`. Not persisted across sessions (a seeded row is a conversation, not a preference). `rec_more_like_this`. |
| **Tune chips** | Tune bar under the For-you heading | Re-ranks the **same cached pool** (filters → `greedySelect`); row cross-fades (150ms opacity, skeleton only after 300ms). Chips persist in the URL via `useUrlState` key `tune` (`/?tune=series,darker,under100`) — Back restores. | `getHomeRecs({ tune })`. `rec_tune` with the token list. |
| **Surprise me** | last chip, `Shuffle` icon, button not toggle | Same pool, `λ = 0.5`, excludes the 20 currently shown, random tie-break seeded by a nonce; row cross-fades; the chip spins 360° once (CSS, 400ms). | `getHomeRecs({ tune, shuffle: nonce })`; `rec_shuffle`. Never cached. |
| **Why this?** | anchor tag, heading thumbs | §3.3 | `rec_why_open` (`metadata.kind`). |
| **Ask Cue** | heading trailing pill; Why sheet | §5 | `cue_taste_entry` (`metadata.entry`). |

### 3.5 The Tune bar (the one bold element on home)

Directly under the "For you" heading + sub-line, one horizontally-scrollable chip row
(`scrollbar-hide`, edge fade like `media-scroller`), `min-h-10` chips on mobile /
`md:min-h-8`, DESIGN.md chip recipe (`rounded-full bg-muted text-muted-foreground
text-xs font-medium`), **selected = `bg-brand/15 text-brand ring-1 ring-brand/40`**
(the AI-tag tint — this is the ONE tinted interactive surface on the home page).

```
For you                                                     [✦ Ask Cue]
Built from 42 titles you rated, hearted or logged
( Movies ) ( Series ) ( Under 100 min ) ( Lighter ) ( Darker ) ( Before 2000 ) ( 2020s ) ( Science Fiction ) ( Thriller ) ( Korean ) ( Identity & memory ) ( ⟳ Surprise me )
```

Groups and semantics (`TuneParams`, owner A, consumed by C for `[TUNE:…]`):

```ts
export interface TuneParams {
  media?: "movie" | "series";                  // single-select
  maxRuntime?: 100;                            // "Under 100 min" (movies: runtime; series: episode runtime)
  tone?: "light" | "dark";                     // single-select; from ai_data mood tone
  era?: "classic" | "recent";                  // <2000 | ≥2020, single-select
  genres?: string[];                           // OR, from the user's top-3 LIFTED genres (chips are per-user)
  languages?: string[];                        // OR, lifted non-English languages (adjective chip, e.g. "Korean")
  moods?: string[];                            // OR, top-2 lifted mood/theme labels
  shuffle?: number;                            // nonce → novelty mode
}
export const TUNE_TOKENS = { movies:…, series:…, under100:…, lighter:…, darker:…, classic:…, recent:… } as const; // closed vocabulary; genre/language/mood tokens are `g:<id>`, `l:<iso>`, `m:<key>`
```

Server (`services/taste/tune.ts`): extend `RecCandidate` with `runtimeMinutes`, `year`,
`tone` (one extra join in `fetchCandidateDetails`; null = unknown → kept unless that
filter is on). Apply filters to the 160-pool, re-run `greedySelect` with the
calibration target. If < 8 survive: top up with `fetchPopularCandidates` carrying the
same filters (source `popular`, explanation `popular` "Popular {genre|tone}") — so
the row never goes empty, and the user can see the taste signal thinning out (tagless
cards). Chips with zero survivors in the pool are rendered **disabled** (computed
client-side from the unfiltered DTO's facet counts returned alongside: `tuneAvailable:
Record<token, number>`).

Clear-all: when ≥1 chip is on, a trailing "Reset" text button appears after Surprise.

### 3.6 Cold start → the calibration deck (replaces "Popular in your genres")

Shown when `reason === "cold_start"` (or `positiveCount < MIN_POSITIVES_FOR_CENTROID`).
Component `for-you/calibration-deck.tsx` (lazy; also embedded by the profile owner hint,
§4.6, via the props contract below).

```
Start your taste profile
Rate 10 titles you know — about a minute. Picks appear as soon as 3 land.
┌─────────────────────┐   ●●●●●○○○○○  4 of 10
│                     │
│   poster (2:3)      │   The Matrix (1999) · Science Fiction, Action
│   240px desktop     │
│   ~60vw mobile      │   [ 👎 Not for me ]  [ 👍 Liked it ]  [ ♥ Loved it ]
│                     │   Haven't seen it →
└─────────────────────┘
```

- **Candidates** (`getCalibrationDeck()` → 12): popular, `notAdult`, has embedding
  (so it moves the centroid), vote_count ≥ 1000, one per genre bucket across ≥ 8
  genres, mixed movie/series (≥3 series), excluding anything the user has rated /
  watched / watchlisted / `SKIP`ped in the last 90 days. Deterministic order per user
  per day (seeded by `userId + yyyymmdd`) so a reload does not reshuffle mid-deck.
- **Answers** write REAL signals through the existing rating path (the `setRating`
  action in `server/actions/user-ratings.ts`, which calls the DB-layer `setUserRating`
  — audit + `markStatsDirty` happen for free): Loved → `liked=true`
  (W_LIKED +2); Liked → thumb +1 (W_THUMB +1.5); Not for me → thumb −1 (−1.5, into the
  negative centroid); Haven't seen → `rec_feedback kind:"SKIP"` (90-day expiry, no
  rating). No watch events are created (the user did not log a viewing).
- **Motion**: answered card exits (WAAPI `translateX(±40px)` + fade 200ms, direction by
  answer: left for Not for me, right for Liked/Loved, down for skip), next card scales
  `0.96 → 1`. Mobile adds swipe (pointer events, 60px threshold) as an enhancement — the
  three buttons are always present and are the accessible path. Keyboard: `←` Not for
  me, `→` Liked, `↑` Loved, `↓` skip, announced via `aria-live`.
- **Completion**: after 10 answers, or when the server reports `positives ≥ 3`, the
  deck collapses and the For-you row **grows in** with a one-time `CountUp` on the
  sub-line "Built from {N} titles". `markTasteDirty` + an immediate `recomputeTasteNow`
  (bounded, ~100ms) so the row is real, not stale. If still cold after 10 (all skips):
  "Nothing you've seen yet? Try 10 more" → next deck.
- **Second use** for warm users: the Tune bar's overflow "Sharpen my picks" opens the
  same deck in a Dialog/Drawer, fed by `getCalibrationDeck({ mode: "sharpen" })` =
  candidates from the pool with **mid** relevance (rank 40–120) — the uncertain middle,
  where an answer moves the ranking most. Stretch for A; the props contract must allow
  it from day 0.

Props contract (owned by A, imported by B):

```ts
export interface TasteCalibrationDeckProps {
  mode: "start" | "sharpen";
  onProgress?: (p: { answered: number; positives: number }) => void;
  onComplete?: (r: { positives: number; ready: boolean }) => void;
  className?: string;
}
```

### 3.7 Row order and layout

Desktop and mobile keep the current slot (under Up Next). Order: For you (with Tune bar
and sub-line) → seeded rows (inserted under the row they were spawned from) → Because
rows (≤2) → Taste twins. Row vertical rhythm `space-y-8 md:space-y-10` as today.
Headings use `SectionHeading`; the trailing "Ask Cue" pill is placed via a new
`MediaScroller` `headingAction?: ReactNode` prop (A adds it; purely additive).

### 3.8 States

| State | For you | Because rows | Twins |
|---|---|---|---|
| Guest | nothing (unchanged) | nothing | nothing |
| Loading | heading + Tune bar skeleton (6 chip ghosts) + 6 card skeletons | nothing until data | nothing |
| `cold_start` | calibration deck (§3.6) | hidden | hidden |
| `ok` | row + Tune bar | ≤2 rows | strip if ≥1 twin |
| `no_index` | row (TMDB fallback), Tune bar hidden (no pool to re-rank), sub-line "Based on your favourites" | hidden | as above |
| tune empty | top-up from popular; if even that is empty: "Nothing matches those filters yet. [Reset]" inline, row keeps its height | — | — |
| error | hidden (as today) | hidden | hidden |
| all dismissed | "You've cleared this row. [Surprise me]" | row hides | — |

### 3.9 Taste twins strip v2 (small)

Chip grows to `w-[260px]`: avatar, name, "**{NN}%** taste match", then **two 28×42
poster thumbs of shared loves** (from `sharedFavorites`, needs `TasteTwinDTO.shared:
TitleRef[]` ≤2 — PUBLIC both sides, already the gate) and a 32px **Follow** icon
button (`UserPlus` → `Check`, uses the existing follow action). Heading sub-line stays.

---

## 4. Profile — Taste v2

### 4.1 Layout: four cards become one card + two widgets

Default layout (`registry.ts`): the taste group is `taste.card` (w 12, h 2 → full width
at desktop; mobileSpan 2) followed by `taste.moods` (w 6, h 2) and `taste.people`
(w 6, h 2) side by side. `taste.dna` and `taste.clusters` stay valid widget types for
saved layouts but **both render the Taste card**; `resolveLayout` migrates a saved
layout by replacing the first of them with `taste.card` and dropping the other. The
Taste card is **server-rendered from the public snapshot** (zero JS; cacheable); its
interactive children are small client islands.

```
1440                                                                                 
┌──────────────────────────────────────────────────────────────────────────────────┐
│ ✦ Taste                                                          42 titles        │
│                                                                                  │
│  ┌──┐┌──┐┌──┐┌──┐     Mainstream ●━━━━━┼──────── Niche     top 27% by popularity│
│  │  ││  ││  ││  │     Classic    ──●━━━┼──────── New       median year 2010     │
│  │  ││  ││  ││  │     Focused    ──────┼━━━●──── Eclectic  11 genres            │
│  │  ││  ││  ││  │     Generous   ──────┼●─────── Tough     in line with TMDB    │
│  └──┘└──┘└──┘└──┘     Light      ──────┼━━●───── Heavy     11% emotionally heavy│
│  Sci-fi & fantasy ·                                                              │
│  Crime · Adventure    Identity and memory  Survival  Humanity vs technology       │
│  (cluster labels)                                                                │
│                                        [ Compare with me ]  [ Share ]            │
└──────────────────────────────────────────────────────────────────────────────────┘
```

Mobile (390): posters row (2–4 across, `aspect-[2/3]`, labels under) → axis strand
(full width, labels above each track as today, captions below) → top-3 mood chips →
buttons full-width stacked (`min-h-10`).

### 4.2 Taste card anatomy (`profile/taste/taste-card.tsx`, server)

- **Header**: `WidgetCard` title "Taste" with `Dna` icon; trailing `{positiveCount}
  titles` (metadata recipe, `tabular-nums`). Not "Taste DNA" — the strand is the DNA;
  naming it twice is noise.
- **Cluster posters** (left, `md:w-[280px]`): up to 4 medoid posters, `aspect-[2/3]
  rounded-lg ring-1 ring-border`, overlapped by 25% on desktop when 3–4 (`-ml-6` after
  the first, each a `relative z-[n]`), flat 2–4-across grid on mobile. Each poster is
  a **button** (not a link to the movie): tap → **Cluster explorer** (§4.3). Under them
  the cluster labels as one metadata line "Sci-fi & fantasy · Crime · Adventure" —
  labels fixed per §4.7. If < 2 clusters: show the Four Favorites posters instead with
  the line "Four favourites", and the tap opens the favourites' titles (still truthful).
- **Axis strand** (right, flex-1): five tracks, `h-2 rounded-full bg-muted` (one step
  up from `h-1.5` — the current size is why the "grows from centre" idea is invisible;
  record `h-2` as the strand track in DESIGN.md), centre tick `w-px h-3 bg-border`,
  fill `bg-brand/40` from centre to value, marker `size-3.5 bg-brand ring-2 ring-card`.
  Endpoint labels `text-xs font-medium`, nearer end `text-foreground`, far end
  `text-muted-foreground`. Caption to the right on desktop (`hidden md:block`, one line),
  below on mobile — exactly the current copy templates. Tracks are `role="meter"` as
  today. **Each endpoint label is a button**: tap → **Axis titles sheet** (§4.4) for that
  end. The marker itself is not a target (12px); the labels are (`min-h-10` on mobile).
- **Top moods**: the 3 strongest lifted mood/theme chips (same chip as the Moods widget,
  tinted), tapping opens the same evidence popover/drawer the Moods widget uses (import
  the component; do not duplicate).
- **Actions** (client island, `taste/taste-card-actions.tsx`): **Compare with me**
  (§4.5; signed-in non-owner → toggle; guest → `useSignInPrompt()` "Sign in to compare
  your taste"; owner → hidden) and **Share** (§4.8). Both shadcn `Button variant=
  "secondary" size="sm"`, `min-h-10` on mobile.

### 4.3 Cluster explorer (Popover `w-96` desktop / Drawer mobile + `useHistoryDismiss`)

```
Sci-fi & fantasy
10 titles like Interstellar · 38% of this profile
[poster grid 3 cols, ≤12 titles, title under each — same EvidenceGrid as Moods]
Also: Identity and memory · Survival          ← the cluster's top facets as muted chips (tap → mood evidence)
```

Data: `TasteClusterView.members: TitleRef[]` (≤12, PUBLIC projection only) added to
the public snapshot (B owns `profile.ts`; TASTE_ALGO_VERSION bump is A's — one bump
covers §3 and §4, see §7). Copy is counts + titles. Owner viewing their own profile
sees the same PUBLIC members (the profile is the public view; the FULL picture lives in
Cue and the home rows).

### 4.4 Axis titles sheet

Tap "Niche" → "Niche end of this profile — 6 favourites in the catalog's long tail",
3-column poster grid of the `axis.examples.high` titles (≤6), each with its own number
under the title: popularity → "top 2% by popularity"; era → year; range → the title's
genres count; rating → "{your score} vs {TMDB avg}" (PUBLIC ratings only); weight →
the AI tone/emotional label. Data: `TasteAxis.examples: { low: AxisExample[]; high:
AxisExample[] }` with `AxisExample = TitleRef & { value: string }`, precomputed at
compute time from PUBLIC positives (B, `axes.ts`). An axis with < 3 examples at an end
disables that end's button (`aria-disabled`, muted).

### 4.5 Compare with me (the delightful bit)

Signed-in visitor taps **Compare with me**: the island calls
`getViewerTasteAxes()` (POST; returns the VIEWER's **PUBLIC** axes, or
`{ status: "insufficient" | "hidden" }`). Then, on the same strand, a second marker per
axis: `size-3.5 rounded-full border-2 border-foreground bg-card` (hollow ring — "you";
shape, not hue, per DESIGN.md social-signal rule) animates from the centre tick to its
value (CSS `left` transition 300ms ease-out, once; reduced-motion: none). A legend line
appears under the strand: "● Ada  ○ You". Captions switch to the **difference**
template: "You sit {n} points closer to Niche" / "Same spot" (numbers only). Toggle
again → markers retract. The button becomes "Hide comparison".

Insufficient → inline hint under the button: "Rate 10 titles to compare — [Start]" opens
the calibration deck (A's component, `mode:"start"`) in a Drawer/Dialog. Hidden (viewer
turned off showTaste) → "Your taste is hidden in Settings → Privacy" — because the
comparison is symmetric and public-only, a viewer who hides their own cannot compare
(that is the honest rule; it also mirrors `canViewTasteMatch`'s symmetry).

Privacy: viewer axes are PUBLIC scope, so a screenshot of the overlay never shows a
private watch on either side. The island renders nothing in cached HTML. Analytics
`taste_compare_toggle`.

### 4.6 Owner hint v2 (`taste-owner-hint.tsx`)

Same dashed card, new content: "Build your taste profile — **{n} of 10** titles
counted" + progress bar + ONE primary button **"Rate 10 titles now"** that opens the
calibration deck (A's `TasteCalibrationDeck`, `mode:"start"`) in a Dialog (desktop) /
Drawer (mobile). On completion the hint shows "Profile ready — it appears on your
profile within a few minutes" (the ISR TTL) and the owner-fresh body path
(`getFreshProfileForOwner`) re-renders the dashboard with the Taste card. Hidden state
copy unchanged.

### 4.7 Fixes folded into the snapshot (B, `lib/taste/{profile,lift,cluster}.ts`)

- **Neutral mood values never display**: denylist `NEUTRAL_MOOD_VALUES` = mid-scale
  values (`intensity:medium`, `tone:mixed`, `pacing:steady`, `emotional:balanced`,
  plus any `*:medium|mixed|moderate|balanced|neutral`). Applied when building
  `snapshot.moods` (so Cue's summary stops receiving them too). Test: a snapshot built
  from a fixture with those tags contains none of them.
- **Cluster label**: prefer the top lifted **genre** facet; if the top facet is a
  keyword/theme, label = "{Genre} · {keyword}" when a genre facet exists ("Science
  Fiction · Scientist" → still odd; so additionally drop single-token *occupation/
  entity* keywords from label candidacy via a small denylist? No — simpler and honest:
  label = top GENRE facet when one exists, else top theme, else the medoid's first
  genre). Render with `line-clamp-2` everywhere a label appears.
- `TasteClusterView.members` (≤12, public) and `TasteAxis.examples` (≤6 per end) added.
- `publicSnapshot.v: 2`.

### 4.8 Share

v1: the Share button uses the Web Share API when available (`navigator.share({ title:
"Ada's taste on The Movie Browser", text: "Niche · Classic · Eclectic — 42 titles",
url })`), else copies the profile URL and toasts "Link copied". `text` is built from
the three axes farthest from centre as endpoint labels + the count — numbers and
dimension words only (Fable-safe). Analytics `taste_share` (`metadata.method`).

Stretch (B, behind a flag, after v1 lands): `GET /u/[username]/taste-card.png` route
handler rendering the Taste card (posters + strand + moods + handle) with `satori` +
`@resvg/resvg-js` (server-only deps; nothing enters the client bundle). Gates:
`showTaste && status==="ready"`, `notAdult` medoids already guaranteed, `Cache-Control:
public, s-maxage=86400, stale-while-revalidate=604800`, `X-Robots-Tag: noindex`,
per-IP rate limit (reuse `chat-rate-limit.ts`'s sliding window), and a 2s render cap →
404 on failure. This is also the natural OG image for `/u/*` once it exists. Do not
build it in the first pass.

### 4.9 Taste match v2 (`taste-match.tsx` + `profile-body-content.tsx`)

- **Move it up**: first child of the stagger container, directly under the hero,
  before the setup card. It is a client island (renders nothing in cached HTML) so the
  ISR invariant holds; for a visitor it is now the first thing after the name.
- Keep the one big number. Replace the three meters with **one line of evidence and
  one stacked bar**:

```
Your taste match with Ada
54%
Agree on 7 ratings · 6 shared loves · favourites 28% alike
[■■■■■■■■■■■■■■■■■■░░░░░░░░░░░░░░░░░░░░]  ← ONE h-2 bar: filled to 54%, segmented by weighted contribution (ratings / loves / favourites) in brand / brand/70 / brand/40; a legend of three labels under it
You both loved   ▣ ▣ ▣ ▣ ▣ ▣
You'd argue about  Title …… You ★4.5  Ada ★2
[ Follow ]  [ ✦ Find something for both of us ]  [ Compare on the strand ↓ ]
```

The segmented bar answers "why 54" without three competing percentages; the
sub-labels keep the honest component numbers one tap away (tooltip on desktop,
tap-to-expand line on mobile). CTAs: existing `FollowButton`; `CueEntryButton` with
message "Find something {firstName} and I would both enjoy tonight" (C's `compare_taste
… picks:true`); "Compare on the strand" scrolls to the Taste card and turns Compare on.
Empty evidence copy unchanged. `taste_match_view` unchanged.

### 4.10 Moods & People widgets (small changes)

- Moods: neutral values gone (§4.7); chips gain a trailing `ChevronRight`-less
  affordance — a 1px dotted underline on the label (`decoration-dotted
  underline-offset-4`) so they read as tappable without a new glyph. Popover/drawer
  unchanged.
- People: each row gains a **"{n} titles" button** (the metric itself) opening the
  same `EvidenceGrid` with that person's titles (`PersonStat.titles: TitleRef[]` ≤6,
  PUBLIC; B adds to `lift.ts`). The name/portrait still link to the person page. In
  "Highest rated" the star metric's tooltip becomes visible text under the metric on
  mobile ("4.5 · 3 rated").

### 4.11 States

| State | Taste card | Moods / People | Match | Owner hint |
|---|---|---|---|---|
| ready, visitor signed-out | server card; Compare → sign-in prompt | widgets | nothing | nothing |
| ready, visitor signed-in | card + Compare | widgets | island (if gate allows) | nothing |
| ready, owner | card (Compare hidden, Share shown) | widgets | nothing | nothing |
| insufficient | nothing (visitor) | nothing | nothing | hint v2 with deck (owner) |
| hidden | nothing | nothing | nothing (gate denies) | hidden copy (owner) |
| compare: viewer insufficient/hidden | inline hint under button | — | — | — |
| cluster explorer / axis sheet loading | content is in the snapshot — no loading state | — | — | — |

---

## 5. AI — Cue entry points and tools

### 5.1 Entry points (all dispatch the existing `ai-chat-trigger` window event)

A shared primitive `components/features/ai/cue-entry.tsx` (owner C):

```ts
export function CueEntryButton(props: {
  message: string;          // sent as the user's message
  label: string;            // visible label
  entry: string;            // analytics: "home_for_you" | "why_sheet" | "match_card" | "detail_fit" | "taste_card" | "tune_bar"
  icon?: ReactNode;         // default: the Cue asterisk glyph (ai-icon.tsx)
  variant?: "pill" | "link";
  className?: string;
})
```

Pill = `rounded-full border border-brand/30 bg-brand/10 text-brand text-xs font-medium
px-3 min-h-10 md:min-h-8` (the chat's own accent language; one per surface). Fires
`cue_taste_entry` then the event. Signed-out: the chat opens anyway (guests get the
full agent); the guest prompt handles the no-profile case as it does today.

| Surface | Label | Message | Tool the agent should reach for |
|---|---|---|---|
| Home For-you heading | Ask Cue | "Help me pick something from my For-you row tonight" | `recommend_for_me` → `steer_recs` on follow-ups |
| Tune bar overflow | Steer with words | "Tune my picks: " (opens with the input focused and prefilled, NOT sent — see note) | `steer_recs` → `[TUNE:…]` |
| Why sheet | Why would I like this? | "Why would I like {Title} ({year})?" | `explain_title_fit` |
| Detail page (signed-in, has profile) | Would I like this? (added to `prompts.ts` detail prompt sets, first slot) | "Would I like {Title}? Compare it to what I usually love." | `explain_title_fit` |
| Match card | Find something for both of us | "Find something {firstName} and I would both enjoy tonight" | `compare_taste({ username, picks: true })` |
| Taste card (owner) | Ask Cue about my taste | "Which part of my taste profile is thinnest, and what would fill it?" | `get_taste_detail` |
| Idle bubble (home, signed-in with profile) | rotating | "What's in my For-you row and why?" / "Pick one thing from my picks for tonight" | `recommend_for_me` |

Note on prefill-not-send: `ai-chat-trigger` sends immediately. C adds an optional
`detail.prefill: true` that opens the chat with the text in the input and focus set
(desktop: `active` state; mobile: drawer open, input focused via the existing
`onAnimationEnd` discipline). Used only by "Steer with words".

Home idle prompts: `getHomepagePrompts()` gains a taste-aware set when
`useSafeSession` is authenticated AND a lightweight `hasTasteProfile` flag is known
client-side (the For-you island already knows `reason === "ok"`; it publishes it to a
tiny zustand slice `stores/taste-ui.ts` — owner A — that `prompts.ts` reads). No new
request.

### 5.2 Steering the home row from chat: the `[TUNE:…]` tag

The agent never manipulates UI directly. `steer_recs` returns the normalized
`tune` tokens; the system prompt instructs the agent to end a steering reply with ONE
`[TUNE:series,darker,under100]` tag. `rich-message-content.tsx` renders it as a pill
"Applied to your For-you row ↓" and dispatches `window` event `recs-tune` with
`{ tokens: string[] }`. The For-you island listens, validates every token against
`TUNE_TOKENS` + its own per-user `g:/l:/m:` sets (unknown → dropped), applies them as
if chips were pressed (URL + re-query), and scrolls the row into view if off-screen.
Deterministic, closed vocabulary, no free text crosses the bridge. If the user is on
another page the pill still renders; tapping it navigates to `/?tune=…` (the URL state
does the rest).

### 5.3 New tools (`src/server/ai/tools/`, owner C)

All: signed-in only (`getUserIdFromConfig`), deterministic (no LLM, no embedding
calls — stored vectors only), `aiToolLogger` on error, `{ error }` JSON on failure,
descriptions with "Use when / Don't use when". Guest prompt adds them to the never-call
list. Tool count 13 → 18. Cost: each is a handful of PG reads; they run only inside a
rate-limited `/api/ai/chat` turn.

| Tool | Input (Zod) | Output | Privacy scope | Notes |
|---|---|---|---|---|
| `get_taste_detail` | `{ part: "clusters" \| "facets" \| "axes" \| "people" \| "all"; clusterIndex?: int }` | clusters with `members[{id,mediaType,title,year}]` (≤12), `share`; facets per type with `count, lift, titles(≤6)`; axes with `value, low, high, caption, examples`; people with titles; `basedOnTitles`, `thinnestCluster` (lowest share) | **FULL** (owner's own chat) | Extends what `get_user_profile.taste` summarises. Prompt: "talk about the titles, never label the person". Adult-keyword filter on labels (reuse `isAdultKeyword`). |
| `explain_title_fit` | `{ mediaType, id }` | `{ excluded: null \| "watched" \| "rated" \| "watchlisted" \| "dismissed", tasteCos, nearestCluster:{label, cos}, anchors:[{title, cos}](≤3), sharedFacets:{genres[], moods[], keywords[], people[]}, axes:[{axis, title: value-or-label, you: value}], negativeCos, verdictBucket: "very close"\|"close"\|"near"\|"far"\|"off" }` | FULL | `services/taste/explain-fit.ts`: project the title's stored embedding into the current space (`getTasteSpace`), cosine vs centroid / cluster means / top anchors (anchors from `foldSignals` top 100 as recs do), facets intersected with the user's lifted facets, axis positions from the title's popularity percentile / year / AI mood vs the user's axes. Returns `{ error: "no_profile" }` when cold. `verdictBucket` is a number bucket, not an adjective about the person. |
| `compare_taste` | `{ username; picks?: boolean; limit?: ≤8 }` | `{ match: TasteMatchDTO (score, components, sharedFavorites, fightAbout, evidence), you:{topGenres[], topMoods[]}, them:{…}, picks?: [{id, mediaType, title, year, reason}] }` or `{ error: "not_available" }` | **PUBLIC both sides**, gated by `canViewTasteMatch` exactly as the match card | Picks: average the two PUBLIC centroids (same space), one `annSearch` per table, exclude the VIEWER's exclusions + dismissals and the TARGET's **public** watched/rated titles (we may only use their public data), `notAdult`, vote floor, blend 0.5/0.5 toward each centroid for the `reason` ("close to both of your favourites: X (you), Y (them)"). On deny the prompt says: do not speculate why; suggest asking them to share ratings. |
| `steer_recs` | `TuneParams` fields (`media, maxRuntime, tone, era, genres[] (names → lifted ids), languages[], moods[], seedTitle?: {mediaType,id}, surprise?: boolean, limit ≤ 10)` | `{ picks:[{id, mediaType, title, year, rating, reason}], tune: string[] (normalized tokens), basis }` | FULL | Calls A's `getHomeRecsForUser(userId, tune, { shuffle })` (the service behind `getHomeRecs`) or `getMoreLikeThis` when `seedTitle` is set. The agent ends its reply with `[TUNE:<tokens>]` when the user asked to change the row (not when they only asked for a one-off list). |
| `record_rec_feedback` | `{ mediaType, id, kind: "dismiss" \| "undo_dismiss" }` | `{ ok: true }` | FULL | ONLY on an explicit user instruction ("don't show me X again", "I'm not interested in X"). Max 5 per turn (counter in `InvocationContext`). Same `rec_feedback` write path as the UI (§6.1) so Undo in the UI undoes it. |

Prompt additions (`prompts/system.ts`): tool table rows; the "what should I watch"
tree gains "constraints like shorter/darker/older → `steer_recs`"; "would I like X" →
`explain_title_fit` (never guess from TMDB genres alone when signed in); "{name} and I"
→ `compare_taste`; the Fable sentence stays. Few-shot gotcha from ai-agent.md: Kimi
parrots examples — write examples with placeholder titles, not real ones.

Tests: handler unit tests with mocked services (pattern: `recommend-for-me.test.ts`);
`compare_taste` reuses the gate and a test asserts a `showTaste=false` target is
denied even with a mutual follow; `[TUNE]` parser test drops unknown tokens and caps
at 8; `record_rec_feedback` test asserts the per-turn cap.

---

## 6. Data / API

### 6.1 Schema (additive only)

```prisma
model RecFeedback {
  id         Int             @id @default(autoincrement())
  userId     Int             @map("user_id")
  mediaType  MediaType       @map("media_type")
  movieId    Int?            @map("movie_id")
  seriesId   Int?            @map("series_id")
  kind       RecFeedbackKind
  rowId      String?         @map("row_id")        // "for-you" | "cluster-1" | "seed-m:603" | "calibration"
  anchorKey  String?         @map("anchor_key")    // "m:603" — the anchor shown when dismissed (for eval)
  source     String          @default("ui")        // "ui" | "cue"
  createdAt  DateTime        @default(now()) @map("created_at")
  expiresAt  DateTime?       @map("expires_at")    // SKIP: +90d; DISMISS: null (forever, until undone)
  user   User    @relation(fields: [userId], references: [id], onDelete: Cascade)
  movie  Movie?  @relation(fields: [movieId], references: [id], onDelete: Cascade)   // same convention as UserRating
  series Series? @relation(fields: [seriesId], references: [id], onDelete: Cascade)
  @@index([userId, createdAt(sort: Desc)])
  @@index([movieId]); @@index([seriesId])
  @@map("rec_feedback")
}
enum RecFeedbackKind { DISMISS SKIP }
```

Plus `postgres/init/04-ugc-constraints.sql`: `UNIQUE NULLS NOT DISTINCT (user_id,
media_type, movie_id, series_id, kind)` and the movie-xor-series CHECK (same shape as
`user_ratings`). Not audited (a preference signal, high churn, no moderation value).
Undo = DELETE. `db push` safety: new table, all defaulted → no `--accept-data-loss`.

### 6.2 Taste maths changes (bump `TASTE_ALGO_VERSION` 3 → 4, `REC_ALGO_VERSION` 3 → 4 — once, by A)

- `TitleSignals.dismissedAt?: Date` (FULL scope only; a dismissal is never public).
  `titleWeight`: `W_DISMISS = −0.75` decayed (constants.ts). A dismissed title with
  other positive signals keeps its net weight (someone can dismiss a rec of a film
  they later love — the rating wins by magnitude).
- `fetchRecExclusions` unions `rec_feedback.kind = DISMISS` ids (and SKIP within
  expiry for the calibration deck only — skips do NOT exclude from recs).
- Public snapshot v2: `clusters[].members`, `axes[].examples`, neutral-mood filter,
  cluster label rule (§4.7). `people[].titles`.
- `RecCandidate` + `fetchCandidateDetails`: `runtimeMinutes`, `year`, `tone`.
- `explainItem(item, anchors)` takes the anchor subset (cluster members for because
  rows) and returns v2 `RecExplanation` with `alsoNear` and `facets`.

### 6.3 Server actions (all POST, Zod-validated, `viewerId()` gate as today)

| Action | File (owner) | Signature | Caching |
|---|---|---|---|
| `getHomeRecs(input?)` | `actions/taste-recs.ts` (A) | `({ tune?: TuneParams, shuffle?: number }) → RecsDTO & { tuneAvailable: Record<string, number>, positiveCount: number }` | pool cached as today (`userId:computedAt:REC_ALGO_VERSION`, re-filtered by fresh exclusions); tune/shuffle = re-rank only, uncached |
| `getMoreLikeThis(seed)` | `actions/taste-recs.ts` (A) | `({ mediaType, id }) → RecRowDTO \| null` | in-process 10 min, key `userId:seedKey:computedAt` |
| `recordRecFeedback` / `undoRecFeedback` | `actions/rec-feedback.ts` (A) | `({ mediaType, id, kind, rowId?, anchorKey? }) → { ok }` | writes; calls `markTasteDirty(userId)` and evicts the user's recs cache key |
| `getCalibrationDeck` / `submitCalibration` | `actions/taste-calibration.ts` (A) | `({ mode }) → { items: CalibrationItemDTO[] }`; `({ answers: [{mediaType,id,answer:"loved"\|"liked"\|"disliked"\|"skip"}] }) → { positives, ready }` | deck deterministic per user-day; submit writes ratings via the existing `setRating` action (→ DB `setUserRating`) + SKIP rows, then `recomputeTasteNow` |
| `getViewerTasteAxes` | `actions/taste-explore.ts` (B) | `() → { status: "ready", axes: TasteAxis[] } \| { status: "insufficient" \| "hidden" }` | PUBLIC scope of the viewer; uncached (cheap row read) |
| `getTasteMatch`, `getTasteTwins` | existing (B/A) | twins DTO gains `shared: TitleRef[]` | as today |

`getHomeRecsForUser(userId, tune, opts)` and `getMoreLikeThisForUser` are exported from
the service layer so C's tools call the service, not the action.

### 6.4 Caching / ISR implications

- Home: unchanged ISR shell; all of §3 is inside the existing client island. URL
  `?tune=` is read client-side only (`useUrlState`), never by the page — no
  `useSearchParams` in the page tree (performance.md §18).
- `/u/*`: Taste card + widgets render from the snapshot in the cached HTML (viewer-
  agnostic). Compare, Share, match, owner hint, deck are islands. No `auth()`/
  `headers()` enters the tree. Snapshot v2 recomputes lazily on the version bump —
  expect one slower first render per profile after deploy (taste-profile.md pre-deploy).
- `rec_feedback` writes evict the in-process recs cache for that user and
  `markTasteDirty`; the taste row recomputes on the next read (bounded, p-limit 2).

### 6.5 Analytics (`ActionType` additions — A adds all of them in one edit)

`rec_dismiss`, `rec_undo`, `rec_more_like_this`, `rec_tune` (`metadata.tokens[]`),
`rec_shuffle`, `rec_why_open` (`metadata.kind`), `rec_seed_row_remove`,
`taste_calibration_answer` (`metadata.answer, position, mode`),
`taste_calibration_complete` (`metadata.positives, mode`), `taste_card_tap`
(`metadata.part: "cluster"|"axis_low"|"axis_high"|"mood"`), `taste_compare_toggle`
(`metadata.on`), `taste_share` (`metadata.method`), `taste_people_titles_open`,
`cue_taste_entry` (`metadata.entry`), `cue_tune_applied` (`metadata.tokens[]`).
Existing `rec_impression` gains `metadata.tune` and `metadata.anchors[]`.

---

## 7. Workstreams (3, disjoint files)

Shared contracts, agreed **before** anyone writes UI (day 0, ≤ 2 hours):

| Contract | Owner | Consumers |
|---|---|---|
| `src/lib/taste/recommend-types.ts` v2 (`RecExplanation`, `RecRowDTO.anchors/tune`, `TuneParams`, `TUNE_TOKENS`, `CalibrationItemDTO`, `TasteTwinDTO.shared`) | A | B (twins), C (`steer_recs`, `[TUNE]`) |
| `src/lib/taste/constants.ts` (`W_DISMISS`, `TASTE_ALGO_VERSION = 4`), `recommend-constants.ts` (`REC_ALGO_VERSION = 4`) | A | B's snapshot v2 rides the same bump — B must NOT edit constants.ts |
| `TasteCalibrationDeck` props (§3.6) at `components/features/home/for-you/calibration-deck.tsx` | A | B (owner hint, compare-insufficient) |
| `CueEntryButton` props (§5.1) at `components/features/ai/cue-entry.tsx`; `recs-tune` event `{ tokens: string[] }`; `ai-chat-trigger` `detail.prefill` | C | A (heading pill, why sheet, tune overflow), B (match card, taste card) |
| `lib/analytics/types.ts` ActionType list (§6.5) | A | B, C fire them |
| Prisma `RecFeedback` + `04-ugc-constraints.sql` block | A | C's `record_rec_feedback` calls A's db module |
| `services/taste/recommend.ts` exports `getHomeRecsForUser`, `getMoreLikeThisForUser` | A | C |
| `services/taste/match.ts` `getTasteMatchFor` (unchanged signature) + a new `getCommonGroundPicks(viewerId, targetId, limit)` | B | C's `compare_taste` |

Sequencing: A and C commit their contract files first (types only, no behaviour), B
and the rest of A/C build against them. Use `isolation: "worktree"` per stream; one
owner folds and commits (CLAUDE.md orchestration rule 7).

### Workstream A — Home For-you v2 + recs server + feedback + calibration

**Files (create/modify):**
- `src/components/features/home/for-you/` (new dir): `for-you-section.tsx` (container,
  ≤ 300 lines), `rec-row.tsx`, `rec-row-heading.tsx` (overlapped thumbs, plural copy),
  `anchor-tag.tsx`, `not-for-me-button.tsx`, `rec-why-sheet.tsx` (lazy), `tune-bar.tsx`,
  `calibration-deck.tsx` (lazy), `use-home-recs.ts` (state, URL tune, optimistic
  dismiss/undo, seeded rows, `recs-tune` listener), `tune-tokens.ts` (client
  validation). `home/for-you-section.tsx` becomes a re-export. `home/taste-twins-strip.tsx`
  (chip v2). `stores/taste-ui.ts` (tiny slice: `hasProfile`, `reason`).
- `src/components/features/media/media-scroller.tsx`: additive `headingAction` prop.
- `src/server/actions/taste-recs.ts`, new `rec-feedback.ts`, new `taste-calibration.ts`.
- `src/server/services/taste/recommend.ts` (+ new `tune.ts`, `more-like-this.ts`,
  `calibration.ts`), `src/server/db/postgres/social/taste-recs.ts` (+ new
  `rec-feedback.ts`, `calibration.ts`).
- `src/lib/taste/recommend.ts` (in-cluster explanations, v2 explanation, tune filter
  pure fn, shuffle λ), `recommend-types.ts`, `recommend-constants.ts`, `constants.ts`,
  `weights.ts`, `types.ts`.
- `prisma/schema.prisma` (RecFeedback), `postgres/init/04-ugc-constraints.sql`.
- `src/lib/analytics/types.ts`. `DESIGN.md` → "Recommendations (home)" rewrite.
**Does NOT touch:** `movie-card.tsx`, `media-card.tsx`, `hover-card/**`,
`title-actions/**` (cards-polish territory), anything under `profile/`, `ai/`.

**Acceptance:**
1. In every because-row, every anchor tag names a title in that row's heading
   (automated: `for-you-section.test.tsx` on fixtures + `recommend.test.ts` builder
   invariant); no because-row card shows a tag equal to the first heading anchor.
2. Not for me removes the card within 250ms, toast with Undo, card returns on Undo;
   reload → still gone (dismiss persisted); a dismissed title never appears in any row
   (`recs.integration.test.ts` extended, :5436, self-skipping).
3. Tune chips change the row without a new ANN (log assertion: no `annSearch` call on
   tune; unit test on `tune.ts` filter + top-up); URL carries `tune=`; Back restores.
4. Surprise me returns ≥ 50% titles not in the previous 20.
5. More like this inserts one row under the source row; max 2; removable.
6. Cold start renders the deck; 3 positives → the row appears without reload;
   answers appear in Library → Ratings (writes went through `setUserRating`).
7. Fable rule test (`no "you're / you are / are a"`) extended to all new copy.
8. Bundle: movie/home entry JS unchanged ±3KB gz (deck and why-sheet are dynamic);
   measure with the §15 manifest method in performance.md.
**Verify (browser, 390 + 1440):** signed-in home: heading thumbs plural, tags, hover
×, why sheet (Popover at 1440 / Drawer at 390, Back dismisses, body
`pointer-events` not stuck), tune chips, shuffle, seeded row; cold user (fresh
test-auth user with no ratings): deck end-to-end incl. keyboard; `prefers-reduced-
motion` emulation shows no transforms.

### Workstream B — Profile taste v2

**Files:** `src/components/features/profile/taste/` (new): `taste-card.tsx` (server),
`axis-strand.tsx` (server, accepts an optional `compare` prop rendered by the island),
`cluster-explorer.tsx` (client, lazy), `axis-titles-sheet.tsx` (client, lazy),
`taste-card-actions.tsx` (client island: Compare, Share, sign-in prompt, deck host),
`compare-overlay.tsx` (client), `evidence-grid.tsx` (moved out of `taste-moods.tsx`,
shared by all sheets). `profile/widgets/{taste-widgets,taste-moods,taste-people}.tsx`,
`widgets/{registry,types,render}.tsx` (`taste.card`, migration), `profile/taste-owner-
hint.tsx`, `profile/taste-match.tsx`, `profile/profile-body-content.tsx` (match first),
`src/server/actions/taste-explore.ts` (new), `src/server/services/taste/match.ts`
(`getCommonGroundPicks`, twins `shared`), `src/lib/taste/{profile,axes,lift,cluster}.ts`
(snapshot v2 + tests), `src/types/social.ts` (DTO fields), `DESIGN.md` → "Taste
profile" rewrite (strand `h-2`, card, sheets). Stretch: `src/app/u/[username]/taste-card.png/route.ts`.
**Does NOT touch:** `constants.ts`, `recommend*.ts`, anything under `home/`, `ai/`.

**Acceptance:**
1. `/u/cinephile_ada` anonymous: Taste card renders server-side (grep the HTML for the
   strand's `role="meter"` and the four posters); no viewer data in HTML (grep for
   "Compare"→ button present, "You" legend absent); ISR intact (`revalidate` + no
   dynamic APIs — verify repeat `curl` TTFB drops).
2. Tap poster → explorer with ≤12 public titles; tap "Niche" → sheet with examples +
   per-title numbers; disabled ends when < 3 examples.
3. Signed-in visitor: Compare overlays hollow markers, difference captions, toggles off;
   viewer's PUBLIC axes only (`taste-privacy.integration.test.ts` extended: a viewer
   whose only horror watches are private shows no horror shift in the overlay axes).
4. Neutral mood values absent from Moods and from the Taste card's top-3 (unit test).
5. Cluster labels never truncate at 390 (`line-clamp-2`), 2-cluster profiles have no
   empty half.
6. Match card is the first element after the hero for a signed-in non-owner; segmented
   bar sums to the headline; CTAs work (Cue entry opens chat with the right message).
7. Owner hint opens the deck (A's component) and the profile re-renders with the card
   after 3+ positives via the owner-fresh path.
8. Widget render tests for `ready / insufficient / hidden`; Fable copy test on the
   card, sheets, compare captions and share text.
**Verify (browser, 390 + 1440):** ada / bea / cy anonymous; ada as `local_tester`
(compare on/off, match card top, Find-for-both opens chat); `local_tester` own profile
(Share, owner hint → deck). Mobile sheets dismiss with Back, no pointer-events strand.

### Workstream C — Cue taste tools + entry points + `[TUNE]`

**Files:** `src/server/ai/tools/{taste-detail,explain-fit,compare-taste,steer-recs,
rec-feedback}.ts` (+ `.test.ts` each), `tools/index.ts`, `tools/taste-summary.ts`
(neutral-mood filter mirrors B's — or simply consume the v2 snapshot once B lands),
`src/server/services/taste/explain-fit.ts` (+ test), `src/server/ai/prompts/system.ts`,
`src/server/ai/agent.ts` (per-turn feedback counter in `InvocationContext`),
`src/components/features/ai/cue-entry.tsx` (new), `ai/prompts.ts` (taste-aware home +
detail prompts), `ai/rich-message-content.tsx` + `ai/chat-tags.tsx` (`[TUNE]` pill →
`recs-tune`), `ai/assistant-floaty.tsx` (`detail.prefill`), `src/lib/ai-page-query.ts`
(allow `tune` on `/`), `.claude/rules/ai-agent.md` (tool list 18, `[TUNE]` contract).
**Does NOT touch:** `home/**`, `profile/**`, `lib/taste/**`, `services/taste/
{recommend,tune,more-like-this,match}.ts` (calls their exports only).

**Acceptance:**
1. Each tool: handler unit test with mocked service (signed-out → error; happy path;
   failure → `{error}`); `compare_taste` denies `showTaste=false` even on mutual follow;
   `record_rec_feedback` caps at 5/turn; `[TUNE]` parser drops unknown tokens.
2. `yarn test:ai "would I like The Terminator?"` against :5436 as `local_tester`
   (needs Bedrock creds) calls `explain_title_fit` and the reply cites a number and
   anchor titles, never a person-label; `"tune my picks to shorter and darker"` ends
   with a `[TUNE:…]` tag whose tokens ∈ `TUNE_TOKENS`; `"find something ada and I would
   both like"` calls `compare_taste` with `picks:true`.
3. Guest prompt lists all five tools as never-call; a guest run of the same queries makes
   zero calls to them (log assertion).
4. `CueEntryButton` fires `cue_taste_entry` then the event; `prefill` opens the chat
   with text in the input and does not send.
5. Bundle: `cue-entry.tsx` is tiny (no new deps); `rich-message-content.tsx` growth
   < 1KB gz.
**Verify (browser):** home signed-in → "Ask Cue" opens the chat and the reply shows
`[MOVIE]` chips from the row; "Steer with words" → input prefilled; send "only series,
darker" → pill renders → For-you chips flip and the row re-queries (A's listener);
detail page → "Would I like this?" prompt present only when signed in with a profile.

### Integration day (single owner)

Fold A + B + C worktrees; run `yarn test:ci`; `prisma db push` on :5436 (new table,
no data-loss prompt); `npx tsx scripts/apply-ugc-constraints.ts`; `pm2 restart mb-dev`;
seed (`seed-social-demo.ts` → `seed-taste-demo.ts`); re-run the browser verification
list above as one sweep (reuse `scratchpad/design/shoot.cjs`, extend with clicks); then
`next build` with a bogus `DATABASE_URL` (prerender fail-open check); DESIGN.md
sections updated in the same commit as the recipes; `.claude/rules/taste-profile.md`
gains: snapshot v2 shape, `rec_feedback`, the "heading = set, tag = member" invariant,
`[TUNE]` bridge.

---

## 8. Out of scope / later

- Learned blend weights, LTR, item-item co-occurrence (vector-upgrades §8: decades
  away at current volume).
- Season/episode-level recs and signals.
- Re-embedding without names (vector-upgrades §8 recommendation: not now).
- Taste card PNG route / OG image (stretch inside B; not in the first pass).
- "Sharpen my picks" uncertainty deck for warm users (props allow it; build after
  `mode:"start"` is verified).
- A `/u/a/vs/b` page; group taste for 3+ people; "watch together" scheduling.
- Any AI-generated taste copy on the profile (Fable rule), proactive Cue nudges on
  render or crawler paths, Cue writing ratings or watch events (it may only record
  rec feedback, on explicit instruction).
- Per-edit CDN purge for the taste privacy toggle (unchanged: `revalidatePath` + ~5 min).
- Rewriting the hover preview to show rec reasons (the why sheet covers it; the
  preview stays shared and display-neutral — revisit once cards-polish settles).
