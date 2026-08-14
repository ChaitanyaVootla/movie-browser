# Admin Analytics Overhaul — Design

**Date:** 2026-08-14
**Status:** Approved to proceed (user delegated the decisions 2026-08-14)
**Related rules:** `.claude/rules/analytics-system.md`, `.claude/rules/cdn.md`

---

## 1. The problem

The dashboard measures the **system** well (cost, Lambda, CPU, DB, cache, errors) and
the **audience** carefully (a four-tier split with humans reported as a range). It
cannot answer whether anyone is *using the product*.

Three concrete findings drove this design:

1. **The most interesting fact on the site is invisible.** `ai_chat_open` 348 →
   `ai_chat_submit` 17 over 30 days — a 95% abandonment of Cue. Nothing in the UI
   surfaces it. Likewise `search_submit` 263 → `search_result_click` 103.
2. **Data is already collected and never rendered.** 9 of 23 API `type` values have no
   UI consumer. `getItemAnalytics` already computes `watchlistAdds`,
   `watchlistRemoves`, `ratingLikes`, `ratingDislikes`, `watchClicks`, `trailerPlays`
   — **none of the six is displayed anywhere**. `type=content`
   (`getUserActionSummary`/`getDailyUserActions`/`getTopContent`) has no consumer.
   `getPerformanceByPageType` and `getPerformanceTrend` exist server-side, unrendered.
3. **The denominator is broken.** Over 3 days the scraper fleet produced **3,794,346
   distinct `session_id`s at 1.20 views each**, versus 59.67 for authenticated humans.
   `session_id` is `hash(IP + UA + Accept-Language)` with no cookie and no round-trip
   requirement, so a fleet rotating residential IPs mints a free identity per IP. Any
   funnel or retention metric built on that denominator inherits the inflation.

Nothing named `funnel`, `retention`, `conversion`, `journey`, `returning` or
`next_page` exists anywhere in the analytics or admin code today.

## 2. Decisions

| # | Decision | Why |
|---|---|---|
| D1 | **Render-first, then collect** — surface existing unrendered data before adding anything new | Cheapest value, zero new collection risk, and it de-risks later phases by proving the data is real |
| D2 | **Identity collection ships early and standalone** | Identity data has no history; every day without it is permanently lost. But it does not gate the panels |
| D3 | **Server-minted, HMAC-signed, HttpOnly first-party cookie** for visitor identity; sessions derived at query time from a 30-minute inactivity gap | The only mechanism that supports honest multi-day retention (cookieless destroys the salt, so there is no key to join on — not backfillable). Also a **privacy improvement** on today's unsalted fingerprint, and it converts bot **inflation** into bot **pollution** |
| D4 | **Reorganise the IA around three questions**, moving panels rather than deleting them | 4 top-level + 8 analytics sub-tabs is already past what a person holds in their head; addition makes it worse |
| D5 | **New fleet signals land as observation, never as an automatic shed, in v1** | The Aug 2 incident cost 620→262 GSC clicks because a plausible rule went straight to enforcement. Free-plan WAF has no `Log` action to dry-run with |
| D6 | **Bounded individual-level retention, decided up front** | ICO names indefinite row-level retention as the thing that voids the UK statutory analytics exemption. This is a schema decision, not a later cleanup |

## 3. Architecture: one labelled dataset, two consumers

The key structural insight: **product analytics and fleet detection want the same
data.** A per-visitor ordered sequence of pages + actions + timings is simultaneously
a "journey story" and the input to the three highest-ROI unbuilt fleet signals.

```
                    ┌─ visitor identity (cookie, D3) ─┐
page_views ─────────┤                                 ├──> journeys (ordered per visitor)
user_actions ───────┤                                 │        │
performance ────────┘                                 │        ├──> PRODUCT: funnels, retention,
                                                      │        │    conversion, load-time impact
PG catalog (popularity, adult) ────────────────────────┘        │
                                                               └──> FLEET: embedding dispersion,
honeypot hits (ground truth) ──────────────────────────────────────> popularity mismatch,
                                                                     cookie round-trip, minting rate
```

Building them separately would duplicate the sessionization and the joins. Building
them together also yields the thing the Jul 2026 fleet research said we lacked:
**ground truth.** Every current fleet signal is unfalsifiable because engagement is
our only proxy for "human". Honeypot hits and cookie round-trip behaviour are
*independent* labels, so a detection rule's false-positive rate becomes measurable
rather than argued.

## 4. Phases

Each phase is independently shippable and independently verifiable.

### Phase 1 — Render what already exists (no new collection)
- **Per-title conversion**: surface the six existing `getItemAnalytics` metrics.
- **Action summary + top content**: wire the orphaned `type=content`.
- **Performance by page type + trend**: wire the orphaned `type=performance`.
- Deliverable: a `product` sub-tab. No schema change, no new tracking.

### Phase 2 — Derived metrics on existing data
- **Funnels**: Cue open→submit, search→result-click, detail→watchlist, PWA install.
  Computed from `user_actions` + `page_views`, scoped to the confirmed-human floor.
- **Views-per-identity by cohort** — the 1.20-vs-59.67 metric, as a headline. Cheap
  (one aggregate) and it makes the inflation visible instead of implicit.
- **Load-time → behaviour join**: does a slow page lose the visit? `performance` and
  `page_views` have never been joined.
- **Popularity mismatch**: ClickHouse `item_id` × PG `popularity`. Doubles as a fleet
  signal (humans track Zipf, crawlers sample the long tail uniformly).

### Phase 3 — Identity (ships in parallel with 1–2; gates 4)
- Server-minted opaque id + `HMAC(id, issued_at, key_version)`.
  `Secure; HttpOnly; SameSite=Lax; Path=/`. Lifetime 6 months, rotating signing key.
- **Minted on the `/api/analytics/ingest` response — NEVER on an HTML response.**
  Anon HTML is CDN-cached; `Set-Cookie` in a cacheable body is a cross-user identity
  leak (`cdn.md` footgun 2). The Cloudflare cache-response rule already strips
  `Set-Cookie` on cacheable paths and exempts `/api/*`.
- `HttpOnly` is load-bearing: Safari ITP caps *script-written* persistent cookies to
  7 days; server-set HTTP cookies escape that. Page script can never read or forge it.
- Keep `session_id` — demoted to a **bot-cohort key only**, never an identity.
- Opt-out: honour `Sec-GPC` alongside existing DNT, plus a documented opt-out. Covers
  the UK exemption's "simple and free means to object" and California AB 566 (2027).
- Retention: individual-level rows bounded; aggregates retained. Window set in Phase 3.

### Phase 4 — Journeys + retention (needs Phase 3 data to accrue)
- Per-visitor chronological trace: pages, actions, timings, entry referrer, outcome.
- Return-visit cohorts, new-vs-returning.
- Embedding dispersion + honeypot labelling as fleet signals over the same journeys.

### Phase 5 — Cloudflare edge ingest (post-cutover only)
Once Cloudflare caches HTML, most requests terminate at the edge and vanish from
ClickHouse. `httpRequestsAdaptiveGroups` on Free gives `cacheStatus`, `userAgent`,
`clientRequestPath` with `requestSource:"eyeball"`; retention measured at **8 days**,
max query window 1 day, so a daily cron paging day-by-day. **Build against real rows,
not before.**

## 5. Information architecture

Today: 4 top-level tabs (`analytics`, `users`, `inspect`, `moderation`) and 8 analytics
sub-tabs. Proposed grouping — three questions, no deletions:

| Group | Answers | Contains |
|---|---|---|
| **Product** | Is it being used? | funnels, per-title conversion, journeys, retention, content |
| **Audience** | Who is it? | existing audience/abuse/crawlers/agents/detail panels (unchanged) |
| **Operations** | Is it healthy, what does it cost? | performance, system, database, lambda, costs, errors, query |

Existing panels keep their internals; only their placement changes.

## 6. Invariants the implementation must not break

1. **Never present a metric more confidently than the data supports.** Humans are a
   RANGE, not a number — that is the bug the audience panel exists to fix. Every new
   metric is either scoped to the confirmed-human floor (authenticated OR has a
   `user_actions` row) or carries its contamination caveat on the panel.
2. **No new metric may use raw `session_id` as a person.** Cohort key only.
3. **Sequential awaits, not `Promise.all`, for multi-scan cases** — ClickHouse is
   capped at 0.9 of 2 vCPU. Follow the `audience`/`abuse`/`llm-layer` precedent.
4. **Expensive panels are `enabled:`-gated client-side** so opening a tab does not pay
   for every query.
5. **`--viz-*` palette only**, never `--chart-*` or hardcoded colours; opaque `bg-card`
   inside `/admin` (translucent surfaces composite against the shell's black).
6. **Reuse existing primitives** (`EmptyState`, `CompactStat`, `ChartTooltip`,
   `useChartColors`, the bar-track table pattern from `llm-panel.tsx`). No new chart lib.
7. **Fleet signals are observational in v1** (D5).
8. **Files at/over limit get new files, not extensions**: `users-tab.tsx` (1088),
   `analytics-charts.tsx` (991) are already over; `analytics-dashboard.tsx` (615),
   `route.ts` (521), `queries/audience.ts` (754) are near.

## 7. Testing

- Pure helpers (funnel step math, sessionization boundaries, HMAC sign/verify, cookie
  parse) get unit tests. The SQL-predicate-pinning convention (`audience.test.ts`,
  `llm-layer.test.ts`) applies to any new shared predicate const.
- **Every new metric is validated against prod data before it ships** — the pattern
  used throughout the CDN work: measure, then assert. A funnel that cannot be
  reconciled against a hand-run ClickHouse query does not ship.
- Cookie work additionally: verify no `Set-Cookie` appears on any cacheable HTML
  response, and that `cf-cache-status: HIT` still occurs on anon detail pages.

## 8. Explicitly out of scope

Cross-device identity for anonymous users; session replay; third-party analytics;
any automatic enforcement from new fleet signals; retro-fitting identity onto
historical rows (impossible — the linkage was never captured).
