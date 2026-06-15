# Discussions — Positioning, Surfacing & Rich-Content Design

**Date:** 2026-06-15
**Branch:** `feat/social-phase0` (local only — NEVER push origin; pushing `next` auto-deploys prod)
**Status:** Approved design, ready for implementation planning.
**Builds on:** Phase 1 discussion layer (already shipped on this branch — spoiler-gated
threaded comments, AI submit-gate, per-episode SEO discuss pages, reports/mod queue,
thread summaries, notifications/push, blocks). This spec is the **positioning, surfacing,
and rich-content polish pass** on top of that foundation — it mostly *wires up and
surfaces* what exists, plus a bounded set of new capabilities.

See also: `.claude/rules/social-features.md` (hard invariants — this design honors all
of them), `docs/superpowers/specs/2026-06-12-social-virality-roadmap-design.md` (parent
roadmap; Phase 1 = discussion), `.claude/rules/cdn.md` (edge-cache),
`.claude/rules/performance.md` (AI-cost-safety).

---

## 1. Goal & framing

Phase 1 built a capable discussion engine but it is **under-surfaced** (no counts on
cards, discuss links buried), **under-featured in the composer** (no @-autocomplete UI,
no reactions UI, no rich content), and has **no destination** (discussions only exist
inline on detail pages). This design makes discussions **discoverable, inviting, and
rich** — while staying inside the app's taste-graph ethos (no DMs, no algorithmic feed,
no follower-clout, no downvotes) and its AI-cost discipline.

**The durability moat:** persistent, spoiler-safe, SEO-indexed per-episode/per-title
discussion pages are precisely the void left by IMDb deleting its boards (2017) and
Reddit archiving episode threads after 6 months. We lead with durability; we never
archive or lock threads.

### Non-goals (explicitly out of scope this round)
- **No circles/groups UI** — only *design-for* (reserve seams). Circles are Phase 3.
- **No user image uploads, no external image hotlinks** — deferred to "Discussions v2"
  (they drag in storage, `sharp` re-encode, NSFW scan, CSAM hash-matching legal duty,
  and an SSRF-hardened image proxy — unjustified until real demand).
- **No algorithmic home feed** — the spec deferred a feed to Phase 2; a cross-catalog
  `/discussions` hub (curated sorts, not an attention feed) is the closest we go.
- **No downvotes, ever** — researched verdict: they need scale + anti-brigading machinery
  and backfire in small communities. Like-only + Flag.
- **No DMs, no quote/repost.**

---

## 2. Positioning & information architecture

Four nested layers, each linking down to the next:

1. **Entry-point strip** — near the top of every movie / series / episode detail page.
   Shows the adaptive count + an inviting CTA (see §5). Click jumps to the inline
   section (in-page anchor) or out to the dedicated page. This is the "draw them in"
   surface the catalog cards also reuse.
2. **Inline discussion section** — lower on the detail page. A *preview*: top N threads +
   composer + "View all → " link to the dedicated page. NOT the full archive.
3. **Dedicated discussion pages** — new full-page experiences:
   - `/movie/[id]/discussions` — single-scope (movie) page.
   - `/series/[...params]/discussions` — the **discussion index for the whole show**:
     activity-first list (Trending · Latest) with `All · Season ▾ · Episode ▾` scope
     filters, progress-gated. The existing `/series/[...]/discuss/sNeN` per-episode page
     becomes the episode-scoped case of this family.
   - These are the **canonical, shareable** homes for a title's discussion and the SEO
     surface (`DiscussionForumPosting` JSON-LD, already implemented for episodes —
     extend to movie/series roots).
4. **Global `/discussions` hub** — cross-catalog browse: **Hot · New · Following** tabs.
   A destination to land and graze. Curated sorts (cheap SQL, §4), not an algorithmic
   feed. **In scope for this round** (Phase 4 below).

### Series discussions page — layout (decided)
**Activity-first**: `Trending` and `Latest` sorts at top, with `All · Season ▾ ·
Episode ▾` scope filters. Whole-series and season-level threads are reachable via the
scope filter. **Spoiler safety in a mixed/activity list:** Trending/Latest rank **only
among threads the viewer is allowed to see** (lifetime watermark). Episodes ahead of the
viewer's progress NEVER appear in Trending by title — they render as honest `🔒 unlocks
at SxEy` rows (or collapse under a "spoilers ahead" divider). The anon/crawler tier shows
only `spoilerScope=NONE` threads, as today.

---

## 3. Reading & threading experience

- **Threading: depth-2, flat replies** (already built; research-confirmed as the modern
  norm — YouTube/Instagram/Bluesky all flattened; deep nesting dies on 390px mobile).
  Reply-to-a-reply re-parents to root and renders in the same flat reply list with an
  `@name` inline prefix to preserve who-answered-whom. Keep the depth-2 cap.
- **Spoiler gate: unchanged.** Lifetime watermark only (never the current-cycle pointer).
  Anon-cacheable tier = `spoilerScope=NONE` + `PUBLISHED` + `circleId IS NULL`. Gated
  tier loads via the `loadComments` server action (POST, never edge-cached). Support
  both the **structural watch-progress gate** AND inline `[spoiler]…[/spoiler]` tags
  (different problems: whole-comment gating vs. a future-reference inside an otherwise-safe
  comment).
- **Sorting — defined cheaply, NO AI/ML:**
  - **Trending** = recent comment velocity (count of child activity in a rolling
    24–72h window) + like count, read from **denormalized counters** (no per-render
    scan). A cheap periodic refresh (or increment-on-write) keeps the signal current.
  - **Latest** = `createdAt DESC` (keyset pagination, as today).
  - **Top** (within a thread) = net likes, tie-break newest. No Wilson score (needs vote
    volume we won't have at small scale).
- **Rewatch affordance:** `watch_events` already models rewatch as a new row + per-rewatch
  reviews via `watchEventId`; surface rewatch notes distinctly so a rewatcher's comment
  doesn't read as a first-watch spoiler. (Light treatment this round.)

---

## 4. Surfacing & counts

Research finding honored: a **low** count ("3 comments") is *negative* social proof —
it suppresses participation. Treatment = **Adaptive baseline + recency upgrade**:

- **Cacheable / anon baseline (B):** below a threshold (~5–10 comments) show an invite
  ("💬 Start the discussion" / "Join the discussion · a few going"); at/above threshold
  show the real count + a light activity hint ("💬 248 comments · active today"). This
  is safe to bake into ISR HTML (no viewer data).
- **Viewer upgrade (C), client-side only:** once the viewer is known, hydrate the strip
  to actionable recency — **"N new since you watched"** / "active now" (NN/g's #1
  heuristic: visibility of system status; the strongest return-visit driver). MUST hydrate
  client-side via server action — never in cacheable HTML (edge-cache invariant).
- **Flows down to all surfaces:** large media cards, search results, the global hub, and
  the entry-point strip all use the same adaptive treatment. Counts on cards are the
  cacheable baseline; "new since you watched" is the client upgrade.
- **"New since you watched" mechanic:** track the viewer's last-seen marker per
  discussion anchor (a per-user read cursor — `comment-reads.ts` already exists for the
  read path; extend with a per-anchor last-seen timestamp). Compute unread against
  visible (gated) comments only.

---

## 5. Composer & rich content (rungs 1–5; uploads/hotlinks deferred)

The composer ships these cumulative capabilities:

1. **Text + markdown-lite + spoiler tags.** Bold/italic/quote, auto-linkified URLs,
   inline `[spoiler]…[/spoiler]`. Rendered via `react-markdown` (NO
   `dangerouslySetInnerHTML`; restricted `allowedElements`) + a server `sanitize-html`
   pass on write. No raw HTML ever reaches cacheable RSC.
2. **Unified `@` mentions — users AND entities.** One `@` type-ahead with sectioned
   results: **People (→ `/u/[username]`) · Titles · Cast/People · Episodes**. Renders as
   a live link/card showing the entity's *current* name (auto-updates on catalog change).
   - `@user` → MENTION notification (respects blocks). The parser/`resolveMentions`
     exists for users; extend to entities.
   - `@entity` → renders an inline link/unfurl card to the title/person/episode page
     using **our own TMDB CDN imagery** (zero third-party risk). **Does NOT fan out** —
     no "someone mentioned Dune" blast (that's an attention pattern, violates no-fan-out).
3. **Reactions — Like only.** Single 👍 on comments via the existing `Reaction` table
   (UI is the gap). No downvotes. A small positive set (❤️😂😮😢) is a *later* option, not
   v1 — avoid importing sentiment we'd have to rank.
4. **Link-preview cards + lite-YouTube.** Server-side unfurl of OG/oEmbed metadata into a
   stored, cached preview card (title/description/image/domain) instead of bare links.
   YouTube via a **click-to-load facade** (`lite-youtube-embed` / `youtube-nocookie`),
   never a raw iframe. **SSRF-hardened fetcher** (scheme allowlist, block RFC1918/
   link-local after DNS resolution, cap redirects, timeout — reuse the proxy
   slug-resolver's 2s-cap discipline). Unfurl result cached (a small `link_unfurls`
   table keyed by URL hash) so it's never refetched on render/crawl.
5. **Catalog-image picker.** Drop a still / poster / backdrop / headshot from **our TMDB
   CDN** into a comment via a picker (mirrors the profile backdrop picker). Stored as a
   TMDB file-path reference (+ entity id), prefixed at render. **Zero upload, storage,
   NSFW, or CSAM exposure** — the most useful images in a movie discussion anyway.

**Deferred to Discussions v2 (rungs 6–7):** user-uploaded images (our CDN) and
allowlisted external image hotlinks — both gated behind their upload/NSFW/CSAM/proxy
machinery when demand justifies it.

---

## 6. Moderation & content safety

Posture: **post-moderate clean, hold risky** (chosen). Pipeline, cheapest-first:

1. **Rate limit by `userId`** (exists — `discussion/rate-limit.ts`).
2. **`obscenity` prefilter** (MIT, active, TS-native; handles leetspeak / unicode
   confusables / zero-width evasion that wordlist filters miss). Catches obvious slurs/
   profanity deterministically and can short-circuit before the LLM.
3. **Spam heuristics:** hold on ≥2 links, near-duplicate body hash, (later) disposable-
   email/first-post trust signals.
4. **Existing Bedrock LLM gate** (`moderation/comment-gate.ts`) for borderline cases —
   classifies toxicity + suggests spoiler scope, **fail-closed → `PENDING_REVIEW`** on
   timeout/parse/error. Runs ONLY on submit, rate-limited. The prefilter reduces LLM
   call volume.
5. **Reports queue + admin actions** (exist — `social/reports.ts`): approve / remove /
   resolve. Surface the admin moderation tab.
6. **Rendering safety:** `react-markdown` + server `sanitize-html`; links emitted with
   `rel="nofollow ugc noopener noreferrer" target="_blank"`; no raw user iframes; CSP
   `frame-src` allowlist for the YouTube facade.
7. **Action ladder:** warn → remove → (later) mute/limit → suspend, with the audit log
   backbone (`audit_log` already covers `comments`).

**Pre-prod legal note (cheap, do before public launch):** register a DMCA Designated
Agent (~$6) + a `/dmca` contact — relevant for any UGC (comments/reviews/lists), not
just uploads. CSAM hash-matching obligation only triggers if/when user image uploads ship
(rung 6) — not in this scope.

**AI cost-safety (reaffirmed, tightened):** discussions add **zero per-title /
per-render / per-crawl AI**. AI fires ONLY on (a) a human comment submit — bounded by
real comment volume, not catalog size, prefilter trims LLM calls — and (b) explicit user
click (thread summary, cached in `thread_summaries`). The silent long tail costs nothing.

---

## 7. Notifications (bounded, write-on-event, no fan-out)

Fires for (chosen): **reply to my comment · @mention of me · new episode/season dropped
for a show I track · likes on my comment**.

- **Likes are batched + low-priority** ("Ada + 3 others liked your comment") to avoid a
  vanity-buzz spiral — never one-notification-per-like.
- **New episode/season dropped** (research: TV Time's single biggest retention lever) —
  derived from the catalog release data for shows in the viewer's `series_progress`
  (WATCHING/REWATCHING) / tracked set; "its discussion is now open." Bounded by the
  viewer's tracked set, NOT a fan-out write.
- All respect blocks; web push is VAPID-gated (unset keys = silent no-op).

---

## 8. Cue — AI conversation seeds on trending titles only

The cold-start answer that bounds AI cost by spending it **only where traction is
already likely** (the trending set), instead of the long tail (wasted).

- **Author:** a reserved system user **Cue** (the existing AI persona), **clearly badged
  as AI** on the comment. Transparency: the host opening a thread, NOT astroturfed humans.
  Replies to Cue are normal user comments (gated normally).
- **Scope:** **title-level only** (movie root / series root), **always
  `spoilerScope=NONE`** → anon-cacheable, SEO-visible, cannot spoil. No per-episode seeds
  (cost + spoiler risk).
- **Cost cap (the whole point):** a scheduled PM2 job (`CRON_HOUR_UTC`-guarded,
  `nice -n 19`) walks the **current trending set** (popularity already computed), capped
  at **top-N/day**, and seeds **one** Cue starter per title — **idempotent**: skip any
  title that already has a Cue seed OR any real human comment. Cost = O(trending/day),
  flat and predictable, never O(catalog). Fires on zero render/crawl paths — a bounded
  batch writing plain comment rows.
- **Content:** a short, spoiler-free, opinion-inviting prompt grounded in metadata we
  already have (`ai_data` themes/premise/genre). One Bedrock Flex call per seeded title.
- **Gate:** Cue's own posts skip the toxicity gate (trusted system author).
- **Net effect:** plain-empty everywhere (the long tail stays genuinely empty, per the
  cold-start decision) EXCEPT the handful of titles most likely to convert a reader into
  a poster get a warm, branded opener.

---

## 9. Circles-readiness (design-for, do NOT build)

The `comments.circleId` column + spoiler gate already accommodate group threads. This
round only **reserves the seams** so Phase 3 circles slot in without rework:
- The `/discussions` hub and series page get a **future audience/circle filter slot**
  (not wired).
- The composer gets a **future audience selector** affordance (not wired).
- All public read paths keep `circleId IS NULL` baked in (`getPublicCommentPage`), so
  reserving the seam changes nothing about the cacheable tier.
No circle models, UI, or query paths are built here.

---

## 10. Schema / route deltas (mostly additive)

**Routes (new):**
- `/movie/[id]/discussions` (single-scope full page).
- `/series/[...params]/discussions` (the show discussion index; activity-first + scope
  filters). Existing `/series/[...]/discuss/sNeN` stays as the episode case.
- `/discussions` (global hub: Hot · New · Following).

**Data (new-ish, all additive — no catalog-table changes, natural-key invariant intact):**
- **Denormalized counters** for cheap Trending/Top: per-anchor recent-activity signal +
  like/reply counts (extend existing `likeCount`; add a rolling activity counter or a
  cheap periodic recompute). No per-render scans.
- **`link_unfurls`** cache table (keyed by URL hash): unfurled OG/oEmbed card data, so
  link cards never refetch on render/crawl.
- **`@entity` mention storage** — extend the existing mention parse/store to record
  entity references (typed nullable anchor columns, never generic `(itemId, itemType)` —
  honors schema invariant). Live-link rendering reads current catalog name.
- **Per-anchor last-seen read cursor** — extend `comment-reads.ts` to power "new since
  you watched."
- **Catalog-image attachment** on a comment — a TMDB file-path reference (+ entity id),
  stored on the comment (e.g. in a small structured field), prefixed at render.
- **Cue system user** — a reserved `users` row (bot flag in `metadata`), username `cue`.
- **Reactions UI** wires the existing `Reaction` table (no schema change).

**No new heavy infra:** no upload pipeline, no image proxy, no per-title background AI.

---

## 11. Hard invariants this design preserves (from `social-features.md`)

1. **Edge-cache:** `/u/*`, movie/series, and all discuss pages stay ISR-cacheable; NO
   viewer data in cacheable HTML; viewer state (counts upgrade, gated comments, like
   state, "new since") hydrates client-side via server actions; no `auth()`/`headers()`
   in those render trees. New dedicated pages export `generateStaticParams` + `revalidate`.
2. **Spoiler-gate:** anon-cacheable tier = `NONE` + `PUBLISHED` + `circleId IS NULL`
   only; gated bodies never in cacheable HTML; gate reads lifetime watermark only.
3. **Natural-key episodes** — `(series_id, season_number, episode_number)` + soft
   `tmdb_episode_id`; NEVER FK to `episodes`/`seasons`.
4. **`requirePgUserId` / `USER_DATA_SOURCE=postgres`.**
5. **Audit actor attribution** — mutating actions on audited tables (incl. `comments`)
   run through `auditedTransaction`.
6. **AI cost-safety** — AI only on submit (gated, rate-limited) or explicit click
   (cached); NEVER on render/crawl. Cue seeds are a bounded cron batch (§8).
7. **DESIGN.md is law** — mobile-first 390px, `@/lib/design` primitives, semantic tokens,
   40px+ touch targets, safe-area; only the over-imagery white exception; no edits under
   `src/components/ui/`.

---

## 12. Phasing (build order — surface-first)

1. **Phase A — Surface what's built.** Entry-point strip + adaptive counts (§4 baseline),
   inline section polish, dedicated `/movie/[id]/discussions` + `/series/[...]/discussions`
   pages (activity-first + scope filters, `DiscussionForumPosting` JSON-LD on roots),
   counts on cards/search. Highest ROI; mostly wiring + light backend (denormalized
   counters, Trending/Latest sort). Adds "new since you watched" read cursor + client
   upgrade.
2. **Phase B — Richer composer.** Unified `@`-mention type-ahead (users + entities) with
   live-link rendering + entity mention storage; **Like** reaction UI; catalog-image
   picker + render; markdown-lite + `[spoiler]` + sanitize hardening; `obscenity`
   prefilter.
3. **Phase C — Link & trailer cards.** SSRF-hardened unfurl service + `link_unfurls`
   cache; link-preview card rendering; lite-YouTube facade + CSP `frame-src`.
4. **Phase D — Destination & retention.** Global `/discussions` hub (Hot · New ·
   Following); "new episode/season dropped" notifications; Cue trending-seed cron + Cue
   system user + AI badge.

Each phase is independently shippable and merges back to `feat/social-phase0` in order.

---

## 13. Open follow-ups / pre-deploy (not blockers for this branch's local build)
- DMCA Designated Agent registration before public launch (§6).
- Single-path CloudFront invalidation hooks for moderation removals on cacheable discuss
  pages (the parent spec's open follow-up; wire when relying on instant removal).
- Confirm CSP `frame-src` (YouTube facade) + `img-src` (TMDB CDN) additions in
  `next.config.mjs` / Caddy don't regress existing embeds.
- Reactions emoji-set expansion and rung 6–7 (uploads/hotlinks) remain future.
