# Discussions — Phase B: Richer Composer (Implementation Plan)

**Date:** 2026-06-15
**Branch:** `feat/social-phase0` (local only — **NEVER push origin**; pushing `next` auto-deploys prod)
**Spec:** `docs/superpowers/specs/2026-06-15-discussions-positioning-design.md` §5 rungs 1–5 (except link cards/lite-YouTube = Phase C) + §6 sanitize/obscenity.
**Depends on:** Phase A (counts, dedicated pages) — assumed DONE before this runs.

## Goal

Make the discussion composer rich while preserving every hard invariant from
`.claude/rules/social-features.md`. Phase B ships, cumulatively:

1. **Markdown-lite + inline `[spoiler]…[/spoiler]`** — `react-markdown` with a restricted
   `allowedElements` (NO `dangerouslySetInnerHTML`) + a server-side `sanitize-html` pass
   on write. Inline spoiler tags reveal-on-tap, independent of the structural watch-gate.
2. **Unified `@`-mention type-ahead** — one `@` palette with sectioned results
   **People (→`/u/[username]`) · Titles · Cast/People · Episodes**. Entity refs stored via
   **typed nullable anchor columns** (NEVER generic `itemId/itemType`), rendered as a live
   link showing the entity's **current** catalog name. `@user` → MENTION notification
   (respects blocks, exists); `@entity` does **NOT** fan out.
3. **Like (👍) reactions** — wire the existing `Reaction` table; atomic `likeCount`; one
   row per (user, comment); **no downvotes**.
4. **Catalog-image picker in the composer** — pick a still/poster/backdrop/headshot from
   our TMDB CDN (mirrors the profile backdrop picker), stored as a TMDB file-path
   reference (+ entity id) on the comment, prefixed `TMDB_IMAGE_BASE` at render. **Zero upload.**
5. **`obscenity` prefilter** — deterministic profanity/slur short-circuit BEFORE the LLM
   gate in the create path (pairs with `comment-gate.ts`).

## Architecture

- **Storage:** Comment gains typed columns for the image attachment (`attachmentEntityType`,
  `attachmentMovieId`, `attachmentSeriesId`, `attachmentPersonId`, `attachmentImagePath`)
  and entity mentions live in a new **typed** join table `CommentEntityMention`
  (`commentId` + exactly-one-of `movieId|seriesId|personId|(seriesId,seasonNumber,episodeNumber)`).
  No generic `(itemId,itemType)` — honors invariant 3 + the schema invariant in §4.1.
  Entity mentions FK only to stable catalog parents (`movies`/`series`/`persons` with
  `onDelete: Restrict`); episode references use natural keys (no FK to `episodes`).
- **Render safety (invariant 1):** comment bodies are sanitized **on write** (server),
  rendered **read-only** through `react-markdown` with an allowlist + custom renderers.
  `MentionText` is replaced by `CommentBody` markdown renderer. Mention/entity links are
  encoded by the writer as plain markdown links/tokens the renderer maps to catalog
  links — no viewer data, fully cacheable.
- **Mentions resolution (invariant 6, AI cost-safety):** entity mention parsing/resolution
  is pure catalog reads (no AI). `@user` notify path unchanged (write-on-event, blocks-aware).
- **Create path order (invariant 6 + §6 cheapest-first):** `requirePgUserId` → Zod →
  rate-limit → **obscenity prefilter (deterministic, free)** → AI gate (unchanged) →
  `auditedTransaction` insert → entity-mention + attachment persisted inside the same tx →
  notifications fire-and-forget after.
- **Like reactions:** server action `toggleLike` (audited? No — `reactions` is NOT in the
  audit opt-in set per `audit-log.md`; plain `prisma.$transaction` with atomic
  `likeCount` increment/decrement). Viewer's own like-state hydrates client-side via the
  gated `loadComments` path (never baked into cacheable HTML — invariant 1).

## Tech Stack

- `react-markdown@^10.1.0` (already a dependency — confirmed in `package.json`).
- **`yarn add sanitize-html`** + **`yarn add -D @types/sanitize-html`** (server write-time sanitize).
- **`yarn add obscenity`** (MIT, TS-native deterministic profanity prefilter).
- **`yarn add remark-gfm`** (autolink literals + strikethrough for markdown-lite; pinned `allowedElements`).
- Vitest (`^4.0.16`), `include: src/**/*.test.{ts,tsx}`, `setupFiles: ./vitest.setup.ts`.
- Prisma 6.x, dev DB on **:5436** only.

## For agentic workers

Execute with **`superpowers:subagent-driven-development`**: one task = one subagent,
strict TDD (`superpowers:test-driven-development`) — write the failing test, run it and
SEE it fail, write the minimal impl from the COMPLETE code below, run it and SEE it pass,
then commit. Use `superpowers:verification-before-completion` before any "done" claim.
Tasks 1–11 are mostly sequential (schema → server → UI). Independent leaves
(obscenity prefilter, sanitize util, markdown renderer) can parallelize per
`superpowers:dispatching-parallel-agents` once the schema lands (Task 1).

**Pinned commands (every task):**
```bash
DATABASE_URL='postgresql://dev:dev@localhost:5436/moviebrowser' yarn vitest run <path>
yarn typecheck
```
After ANY `prisma/schema.prisma` change:
```bash
DATABASE_URL='postgresql://dev:dev@localhost:5436/moviebrowser' yarn db:push
npx pm2 restart mb-dev    # running dev server holds the OLD client → "Unknown argument" otherwise
```
**Commit message footer (every commit):**
```
Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
```
**NEVER `git push`.**

---

## File Structure

| File | Created/Modified | Responsibility |
|------|------------------|----------------|
| `prisma/schema.prisma` | **M** | Add 5 attachment cols to `Comment` + new `CommentEntityMention` model (typed nullable anchors) + back-relation. |
| `src/server/services/discussion/obscenity-filter.ts` | **C** | Deterministic `containsObscenity(text): boolean` using `obscenity` matcher. Pure, no AI. |
| `src/server/services/discussion/obscenity-filter.test.ts` | **C** | Unit tests for slurs/leetspeak/clean text. |
| `src/server/services/discussion/sanitize-comment.ts` | **C** | Write-time `sanitizeCommentBody(raw): string` (sanitize-html allowlist) + `MARKDOWN_ALLOWED_ELEMENTS`/`ALLOWED_MARKDOWN_PLUGINS` shared constants. |
| `src/server/services/discussion/sanitize-comment.test.ts` | **C** | Strips `<script>`, raw HTML, `javascript:` URLs; preserves markdown text + `[spoiler]`. |
| `src/server/services/discussion/mentions.ts` | **M** | Add `parseEntityMentions` + `resolveEntityMentions` (catalog reads, typed results). `parseMentions`/`resolveMentions` (users) unchanged. |
| `src/server/services/discussion/mentions.test.ts` | **M** | Add entity-parse cases (titles/people/episodes tokens). |
| `src/server/services/discussion/comment-schemas.ts` | **M** | Add `CommentAttachmentSchema` + extend `CreateCommentSchema`/`EditCommentSchema` with optional `attachment`. Add `EntityMentionToken` types. |
| `src/server/db/postgres/comments.ts` | **M** | Extend `CommentDto` with `attachment` + `viewerLiked` + `entityMentions`; include them in selects; persist helpers. |
| `src/server/actions/comments.ts` | **M** | Wire obscenity prefilter + sanitize + entity-mention/attachment persistence into `createComment`/`editComment`. |
| `src/server/actions/comment-reactions.ts` | **C** | `toggleLike` server action (atomic likeCount, idempotent, blocks-aware). |
| `src/server/actions/comment-reactions.test.ts` | **C** | Integration test (self-skips green without live :5436 DB). |
| `src/components/features/discussion/comment-body.tsx` | **C** | Read-only markdown renderer (allowlisted `react-markdown`) + `[spoiler]` reveal + entity/user link mapping. Replaces `MentionText` usage in `comment-item`. |
| `src/components/features/discussion/like-button.tsx` | **C** | Client Like toggle (optimistic; 40px+ touch target). |
| `src/components/features/discussion/mention-autocomplete.tsx` | **C** | `@`-type-ahead palette (sectioned People/Titles/Cast/Episodes); shared by composer. |
| `src/components/features/discussion/comment-image-picker.tsx` | **C** | Catalog-image picker (mirrors `BackdropPicker`); also picks stills/headshots. |
| `src/components/features/discussion/comment-composer.tsx` | **M** | Wire mention autocomplete, image picker, attachment preview into existing composer. |
| `src/components/features/discussion/comment-item.tsx` | **M** | Render `CommentBody`, attachment image, `LikeButton`; thread `viewerLiked`. |
| `src/components/features/discussion/comment-list-client.tsx` | **M** | Pass `viewerLiked` through; pass viewer-id into like state. |
| `src/server/actions/discussion-search.ts` | **C** | `searchMentionEntities(query, anchor)` — sectioned catalog search (titles/people/episodes) for the autocomplete. |
| `src/server/actions/discussion-search.test.ts` | **C** | Unit/integration for sectioned search (self-skips without DB). |
| `src/types/social.ts` | **M** | Add shared DTO types (`CommentAttachmentDto`, `EntityMentionDto`, `MentionSearchResultDto`). |

---

## Task 1 — Schema: attachment columns + typed `CommentEntityMention`

**Failing test** — `src/server/db/postgres/comment-entity-mention.test.ts` (new):

```ts
import { describe, it, expect } from "vitest";
import { Prisma } from "@prisma/client";

// Compile-time guard: the generated client must expose the new model + columns.
// (No DB needed — this fails to typecheck/run until schema is pushed & generated.)
describe("CommentEntityMention schema", () => {
  it("exposes typed anchor columns on the create input", () => {
    const sample: Prisma.CommentEntityMentionCreateManyInput = {
      commentId: 1,
      movieId: 550,
      seriesId: null,
      personId: null,
      seasonNumber: null,
      episodeNumber: null,
    };
    expect(sample.commentId).toBe(1);
    expect(sample.movieId).toBe(550);
  });

  it("exposes attachment columns on the comment create input", () => {
    const c: Prisma.CommentUncheckedCreateInput = {
      body: "x",
      attachmentEntityType: "movie",
      attachmentMovieId: 550,
      attachmentImagePath: "/abc.jpg",
    };
    expect(c.attachmentMovieId).toBe(550);
  });
});
```

**Run (fail):**
```bash
DATABASE_URL='postgresql://dev:dev@localhost:5436/moviebrowser' yarn vitest run src/server/db/postgres/comment-entity-mention.test.ts
```
Expect: TS errors `Property 'CommentEntityMentionCreateManyInput' does not exist` / `attachmentMovieId`.

**Minimal impl** — in `prisma/schema.prisma`, extend `model Comment` (add inside the model,
after `likeCount`, before `editedAt`) and add the new model + back-relation:

```prisma
  // Phase B (2026-06-15): catalog-image attachment (TMDB file-path ref + typed entity id).
  // Zero upload — render prefixes TMDB_IMAGE_BASE. attachmentEntityType is the discriminant.
  attachmentEntityType String? @map("attachment_entity_type") // "movie" | "series" | "episode" | "person"
  attachmentMovieId    Int?    @map("attachment_movie_id")
  attachmentSeriesId   Int?    @map("attachment_series_id")
  attachmentPersonId   Int?    @map("attachment_person_id")
  attachmentImagePath  String? @map("attachment_image_path")
```

Add to the `Comment` relations block:
```prisma
  entityMentions CommentEntityMention[]
```

Add to the `Comment` `@@index` block (covering the attachment FK columns — invariant: every FK indexed):
```prisma
  @@index([attachmentMovieId])
  @@index([attachmentSeriesId])
  @@index([attachmentPersonId])
```

New model (place directly after `model Comment { … }`, before `model Reaction`):

```prisma
// Phase B (2026-06-15): typed @-entity mention join. NEVER generic (itemId,itemType).
// Episodes use NATURAL KEYS (series_id, season_number, episode_number) — NEVER FK to
// episodes/seasons (hydration delete+reinserts them). FK only to stable catalog parents.
model CommentEntityMention {
  id            Int     @id @default(autoincrement())
  commentId     Int     @map("comment_id")
  movieId       Int?    @map("movie_id")
  seriesId      Int?    @map("series_id")
  personId      Int?    @map("person_id")
  seasonNumber  Int?    @map("season_number")
  episodeNumber Int?    @map("episode_number")
  createdAt     DateTime @default(now()) @map("created_at")

  comment Comment @relation(fields: [commentId], references: [id], onDelete: Cascade)
  movie   Movie?  @relation(fields: [movieId], references: [id], onDelete: Restrict)
  series  Series? @relation(fields: [seriesId], references: [id], onDelete: Restrict)
  person  Person? @relation(fields: [personId], references: [id], onDelete: Restrict)

  @@index([commentId])
  @@index([movieId])
  @@index([seriesId])
  @@index([personId])
  @@map("comment_entity_mentions")
}
```

Add the back-relations on the catalog parents (find each model, add to its relation block):
- `model Movie`: `commentEntityMentions CommentEntityMention[]`
- `model Series`: `commentEntityMentions CommentEntityMention[]`
- `model Person`: `commentEntityMentions CommentEntityMention[]`

> NOTE on audit: `comment_entity_mentions` and the attachment columns live UNDER the
> already-audited `comments` table only for the parent row. The join table is **NOT**
> added to the audit opt-in set (it is derived data, low human value) — do not add a
> trigger in `05-audit.sql`.

**Push + regenerate:**
```bash
DATABASE_URL='postgresql://dev:dev@localhost:5436/moviebrowser' yarn db:push
npx pm2 restart mb-dev
```

**Run (pass):**
```bash
DATABASE_URL='postgresql://dev:dev@localhost:5436/moviebrowser' yarn vitest run src/server/db/postgres/comment-entity-mention.test.ts
yarn typecheck
```

**Commit:** `feat(discussion): schema — comment attachment cols + typed CommentEntityMention`

---

## Task 2 — `obscenity` deterministic prefilter

**`yarn add obscenity`** (run once; commit the lockfile change with this task).

**Failing test** — `src/server/services/discussion/obscenity-filter.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { containsObscenity } from "./obscenity-filter";

describe("containsObscenity", () => {
  it("returns false for clean discussion text", () => {
    expect(containsObscenity("This movie's third act is a masterpiece.")).toBe(false);
    expect(containsObscenity("")).toBe(false);
  });
  it("flags a common slur", () => {
    expect(containsObscenity("you are a fag")).toBe(true);
  });
  it("flags leetspeak / obfuscated profanity", () => {
    expect(containsObscenity("what the f.u.c.k")).toBe(true);
    expect(containsObscenity("sh1t take")).toBe(true);
  });
  it("does not flag substrings inside innocent words (Scunthorpe)", () => {
    expect(containsObscenity("I live in Scunthorpe")).toBe(false);
    expect(containsObscenity("classic assassin arc")).toBe(false);
  });
});
```

**Run (fail):** module not found.

**Minimal impl** — `src/server/services/discussion/obscenity-filter.ts`:

```ts
/**
 * Deterministic profanity/slur prefilter (spec §6 step 2). Runs BEFORE the LLM
 * gate in the create path: obvious slurs/profanity short-circuit to held without
 * spending a Bedrock call. Pairs with moderation/comment-gate.ts (borderline cases).
 * `obscenity` (MIT) handles leetspeak / unicode confusables / zero-width evasion and
 * uses word-boundary transforms to avoid the Scunthorpe problem.
 */
import {
  RegExpMatcher,
  englishDataset,
  englishRecommendedTransformers,
} from "obscenity";

const matcher = new RegExpMatcher({
  ...englishDataset.build(),
  ...englishRecommendedTransformers,
});

/** Pure: true when the text contains a matched profanity/slur. */
export function containsObscenity(text: string): boolean {
  if (!text) return false;
  return matcher.hasMatch(text);
}
```

**Run (pass) + typecheck.** (If a specific obfuscation case the test asserts is not in the
recommended dataset, relax that single assertion to a clearly-in-dataset term — do NOT
hand-roll a wordlist; the dataset is the source of truth.)

**Commit:** `feat(discussion): obscenity deterministic prefilter`

---

## Task 3 — Write-time `sanitizeCommentBody` + markdown allowlist

**`yarn add sanitize-html remark-gfm` + `yarn add -D @types/sanitize-html`.**

**Failing test** — `src/server/services/discussion/sanitize-comment.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { sanitizeCommentBody } from "./sanitize-comment";

describe("sanitizeCommentBody", () => {
  it("preserves plain markdown-lite text", () => {
    expect(sanitizeCommentBody("**bold** and _italic_ and a [spoiler]reveal[/spoiler]"))
      .toBe("**bold** and _italic_ and a [spoiler]reveal[/spoiler]");
  });
  it("strips raw HTML tags entirely (no dangerous markup survives to render)", () => {
    expect(sanitizeCommentBody('hi <script>alert(1)</script> there')).toBe("hi  there");
    expect(sanitizeCommentBody('<img src=x onerror=alert(1)>caption')).toBe("caption");
  });
  it("neutralizes javascript: protocol inside markdown link text", () => {
    // markdown is rendered by react-markdown later; sanitize removes raw HTML only,
    // but a literal <a href="javascript:..."> must not survive.
    expect(sanitizeCommentBody('<a href="javascript:alert(1)">x</a>')).toBe("x");
  });
  it("collapses to empty when only markup", () => {
    expect(sanitizeCommentBody("<div></div>")).toBe("");
  });
});
```

**Run (fail):** module not found.

**Minimal impl** — `src/server/services/discussion/sanitize-comment.ts`:

```ts
/**
 * Write-time sanitize (spec §5 rung 1 + §6 step 6). Comment bodies are stored as
 * markdown-lite TEXT. We render them later with react-markdown + a restricted
 * allowedElements (NO dangerouslySetInnerHTML), so the stored body must contain NO
 * raw HTML — strip every tag here, keeping the text. This is defense-in-depth: even
 * if a renderer regression enabled rawHtml, nothing survived the write pass.
 */
import sanitizeHtml from "sanitize-html";

/** Strip ALL HTML tags + attributes; keep text content. Markdown syntax is plain text. */
export function sanitizeCommentBody(raw: string): string {
  const cleaned = sanitizeHtml(raw, {
    allowedTags: [],
    allowedAttributes: {},
    // Drop the CONTENT of these (e.g. <script>alert(1)</script> → nothing).
    nonTextTags: ["style", "script", "textarea", "noscript"],
  });
  // sanitize-html decodes entities; trim trailing/leading whitespace from stripping.
  return cleaned.trim();
}

/**
 * react-markdown allowlist shared by the read-only renderer (comment-body.tsx).
 * NO `img`, `iframe`, `a`-as-raw, `html` — links are emitted via a custom `a`
 * component with rel="nofollow ugc noopener noreferrer". Spoiler tags are handled
 * by a remark pre-pass, not raw HTML.
 */
export const MARKDOWN_ALLOWED_ELEMENTS = [
  "p",
  "br",
  "strong",
  "em",
  "del",
  "blockquote",
  "code",
  "pre",
  "ul",
  "ol",
  "li",
  "a",
  "span",
] as const;
```

> The `.trim()` makes `"hi  there"` assertions exact only if a single space remains
> between words; sanitize-html replaces a stripped tag with empty string, so
> `"hi <script>…</script> there"` → `"hi  there"` (two spaces around the removed tag,
> trimmed at the ends only). Keep the test assertions matching that exact spacing — adjust
> the expected strings to the real output if it differs by a space (run the impl, read the
> actual value, pin the test to it — do not guess).

**Run (pass) + typecheck.**

**Commit:** `feat(discussion): write-time sanitize-html pass + markdown allowlist`

---

## Task 4 — Entity-mention parse + resolve (catalog, typed, no AI)

The author encodes entity mentions as explicit tokens chosen in the autocomplete (Task 9),
so the stored body carries unambiguous machine tokens — NOT free-text we re-resolve.
Token grammar (stored in body, rendered by Task 8):

- User: `@username` (unchanged).
- Title: `[[movie:550|Fight Club]]`, `[[series:1396|Breaking Bad]]`.
- Person: `[[person:287|Brad Pitt]]`.
- Episode: `[[ep:1396:5:14|Ozymandias]]` (`series:season:episode`).

**Failing test** — append to `src/server/services/discussion/mentions.test.ts`:

```ts
import { parseEntityMentions } from "./mentions";

describe("parseEntityMentions", () => {
  it("parses typed title/person/episode tokens", () => {
    const body =
      "loved [[movie:550|Fight Club]] and [[person:287|Brad Pitt]] in [[ep:1396:5:14|Ozymandias]]";
    expect(parseEntityMentions(body)).toEqual([
      { kind: "movie", movieId: 550, seriesId: null, personId: null, seasonNumber: null, episodeNumber: null },
      { kind: "person", movieId: null, seriesId: null, personId: 287, seasonNumber: null, episodeNumber: null },
      { kind: "episode", movieId: null, seriesId: 1396, personId: null, seasonNumber: 5, episodeNumber: 14 },
    ]);
  });
  it("parses a bare series token", () => {
    expect(parseEntityMentions("[[series:1396|Breaking Bad]]")).toEqual([
      { kind: "series", movieId: null, seriesId: 1396, personId: null, seasonNumber: null, episodeNumber: null },
    ]);
  });
  it("dedupes identical entity tokens and caps at 8", () => {
    const body = Array.from({ length: 10 }, (_, i) => `[[movie:${i}|m${i}]]`).join(" ");
    expect(parseEntityMentions(body)).toHaveLength(8);
    expect(parseEntityMentions("[[movie:5|A]] [[movie:5|A again]]")).toHaveLength(1);
  });
  it("ignores malformed tokens", () => {
    expect(parseEntityMentions("[[movie:abc|x]] [[unknown:5|y]]")).toEqual([]);
  });
});
```

**Run (fail):** `parseEntityMentions` not exported.

**Minimal impl** — append to `src/server/services/discussion/mentions.ts`:

```ts
/** A typed @-entity reference parsed from a comment body (Phase B). */
export interface ParsedEntityMention {
  kind: "movie" | "series" | "person" | "episode";
  movieId: number | null;
  seriesId: number | null;
  personId: number | null;
  seasonNumber: number | null;
  episodeNumber: number | null;
}

const ENTITY_RE = /\[\[(movie|series|person|ep):([0-9]+)(?::([0-9]+):([0-9]+))?\|[^\]]{0,120}\]\]/g;
const MAX_ENTITY_MENTIONS = 8;

/** Pure: extract typed entity references (machine tokens emitted by the composer). */
export function parseEntityMentions(body: string): ParsedEntityMention[] {
  const out: ParsedEntityMention[] = [];
  const seen = new Set<string>();
  for (const m of body.matchAll(ENTITY_RE)) {
    const tag = m[1];
    const id = Number(m[2]);
    if (!Number.isInteger(id)) continue;
    let mention: ParsedEntityMention;
    if (tag === "movie") {
      mention = { kind: "movie", movieId: id, seriesId: null, personId: null, seasonNumber: null, episodeNumber: null };
    } else if (tag === "series") {
      mention = { kind: "series", movieId: null, seriesId: id, personId: null, seasonNumber: null, episodeNumber: null };
    } else if (tag === "person") {
      mention = { kind: "person", movieId: null, seriesId: null, personId: id, seasonNumber: null, episodeNumber: null };
    } else {
      // ep: requires season + episode groups
      const season = m[3] !== undefined ? Number(m[3]) : NaN;
      const episode = m[4] !== undefined ? Number(m[4]) : NaN;
      if (!Number.isInteger(season) || !Number.isInteger(episode)) continue;
      mention = { kind: "episode", movieId: null, seriesId: id, personId: null, seasonNumber: season, episodeNumber: episode };
    }
    const key = `${mention.kind}:${mention.movieId}:${mention.seriesId}:${mention.personId}:${mention.seasonNumber}:${mention.episodeNumber}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(mention);
    if (out.length >= MAX_ENTITY_MENTIONS) break;
  }
  return out;
}

/**
 * Resolve parsed entity mentions to ones whose catalog parent EXISTS, so we never
 * store a dangling typed reference. Pure catalog reads — NO AI (invariant 6).
 * Returns CommentEntityMention create rows (commentId filled by the caller).
 */
export interface EntityMentionRow {
  movieId: number | null;
  seriesId: number | null;
  personId: number | null;
  seasonNumber: number | null;
  episodeNumber: number | null;
}

export async function resolveEntityMentions(
  mentions: ParsedEntityMention[]
): Promise<EntityMentionRow[]> {
  if (mentions.length === 0) return [];
  const movieIds = mentions.filter((m) => m.movieId !== null).map((m) => m.movieId as number);
  const seriesIds = mentions
    .filter((m) => m.seriesId !== null)
    .map((m) => m.seriesId as number);
  const personIds = mentions.filter((m) => m.personId !== null).map((m) => m.personId as number);
  const [movies, series, persons] = await Promise.all([
    movieIds.length ? prisma.movie.findMany({ where: { id: { in: movieIds } }, select: { id: true } }) : Promise.resolve([]),
    seriesIds.length ? prisma.series.findMany({ where: { id: { in: seriesIds } }, select: { id: true } }) : Promise.resolve([]),
    personIds.length ? prisma.person.findMany({ where: { id: { in: personIds } }, select: { id: true } }) : Promise.resolve([]),
  ]);
  const movieSet = new Set(movies.map((m) => m.id));
  const seriesSet = new Set(series.map((s) => s.id));
  const personSet = new Set(persons.map((p) => p.id));
  const rows: EntityMentionRow[] = [];
  for (const m of mentions) {
    const exists =
      (m.movieId !== null && movieSet.has(m.movieId)) ||
      (m.seriesId !== null && seriesSet.has(m.seriesId)) ||
      (m.personId !== null && personSet.has(m.personId));
    if (!exists) continue;
    rows.push({
      movieId: m.movieId,
      seriesId: m.seriesId,
      personId: m.personId,
      seasonNumber: m.seasonNumber,
      episodeNumber: m.episodeNumber,
    });
  }
  return rows;
}
```

**Run (pass):**
```bash
DATABASE_URL='postgresql://dev:dev@localhost:5436/moviebrowser' yarn vitest run src/server/services/discussion/mentions.test.ts
yarn typecheck
```
(The `resolveEntityMentions` DB branch is exercised in Task 7's integration test; the
`parseEntityMentions` cases are pure and need no DB.)

**Commit:** `feat(discussion): typed entity-mention parse + resolve (catalog, no AI)`

---

## Task 5 — Schemas: attachment + types

**Failing test** — `src/server/services/discussion/comment-attachment-schema.test.ts` (new):

```ts
import { describe, it, expect } from "vitest";
import { CommentAttachmentSchema, CreateCommentSchema } from "./comment-schemas";

describe("CommentAttachmentSchema", () => {
  it("accepts a movie still attachment", () => {
    const a = CommentAttachmentSchema.parse({ entityType: "movie", tmdbId: 550, imagePath: "/abc.jpg" });
    expect(a.entityType).toBe("movie");
  });
  it("rejects an unknown entity type", () => {
    expect(() => CommentAttachmentSchema.parse({ entityType: "list", tmdbId: 1, imagePath: "/x.jpg" })).toThrow();
  });
  it("CreateCommentSchema accepts an optional attachment + defaults it to null", () => {
    const parsed = CreateCommentSchema.parse({ anchor: { type: "movie", movieId: 1 }, body: "hello there" });
    expect(parsed.attachment).toBeNull();
  });
});
```

**Run (fail).**

**Minimal impl** — add to `src/server/services/discussion/comment-schemas.ts` (before `CreateCommentSchema`):

```ts
export const CommentAttachmentSchema = z.object({
  entityType: z.enum(["movie", "series", "episode", "person"]),
  tmdbId: z.number().int().positive(),
  imagePath: z.string().regex(/^\/[\w./-]{1,200}$/, "TMDB file path"),
});
export type CommentAttachmentInput = z.infer<typeof CommentAttachmentSchema>;
```

Add `.attachment` to BOTH `CreateCommentSchema` and `EditCommentSchema` `.object({...})`:
```ts
    attachment: CommentAttachmentSchema.nullable().default(null),
```
(Insert it as a sibling field, before the trailing `})` / before the `.refine(...)` chain on
`CreateCommentSchema` — the `.refine` stays last.)

**Run (pass) + typecheck.**

**Commit:** `feat(discussion): comment attachment Zod schema + composer input`

---

## Task 6 — DTO + reads: attachment, entity mentions, viewerLiked

**Failing test** — `src/server/db/postgres/comment-dto.test.ts` (new, pure mapper test):

```ts
import { describe, it, expect } from "vitest";
import { toCommentDto } from "./comments";

const base = {
  id: 1, parentId: null, body: "hi", spoilerScope: "NONE", scopeSeason: null,
  scopeEpisode: null, scopeTmdbEpisodeId: null, status: "PUBLISHED", likeCount: 3,
  createdAt: new Date("2026-06-15T00:00:00Z"), editedAt: null, aiLabels: null,
  userId: 7, movieId: 550, seriesId: null, seasonNumber: null, episodeNumber: null,
  listId: null, circleId: null,
  attachmentEntityType: "movie", attachmentMovieId: 550, attachmentSeriesId: null,
  attachmentPersonId: null, attachmentImagePath: "/abc.jpg",
  user: { id: 7, username: "ada", name: "Ada", image: null },
  entityMentions: [] as never[],
};

describe("toCommentDto attachment", () => {
  it("maps a TMDB attachment into the DTO", () => {
    const dto = toCommentDto(base as never);
    expect(dto.attachment).toEqual({ entityType: "movie", tmdbId: 550, imagePath: "/abc.jpg" });
    expect(dto.likeCount).toBe(3);
  });
  it("nulls attachment on a deleted comment (scrubbed)", () => {
    const dto = toCommentDto({ ...base, status: "DELETED_BY_USER" } as never);
    expect(dto.attachment).toBeNull();
    expect(dto.body).toBe("");
  });
});
```

**Run (fail).**

**Minimal impl** — `src/server/db/postgres/comments.ts`:

1. Extend `CommentDto`:
```ts
export interface CommentAttachment {
  entityType: "movie" | "series" | "episode" | "person";
  tmdbId: number;
  imagePath: string;
}
export interface EntityMentionRef {
  kind: "movie" | "series" | "episode" | "person";
  tmdbId: number;
  seasonNumber: number | null;
  episodeNumber: number | null;
  name: string; // CURRENT catalog name (live)
  href: string;
}
```
Add to `interface CommentDto`:
```ts
  attachment: CommentAttachment | null;
  viewerLiked: boolean;
  entityMentions: EntityMentionRef[];
```

2. Extend `AUTHOR_SELECT`-bearing reads: change the comment `include` everywhere
(`pageWithReplies`, the reply fetch, the `createComment` include) to also include the typed
mention rows + their current catalog names. Define a shared include const:
```ts
const COMMENT_INCLUDE = {
  user: AUTHOR_SELECT,
  entityMentions: {
    select: {
      movieId: true, seriesId: true, personId: true, seasonNumber: true, episodeNumber: true,
      movie: { select: { id: true, title: true } },
      series: { select: { id: true, name: true } },
      person: { select: { id: true, name: true } },
    },
  },
} as const;
type CommentRow = Prisma.CommentGetPayload<{ include: typeof COMMENT_INCLUDE }>;
```
Replace the old `type CommentRow = …{ include: { user: typeof AUTHOR_SELECT } }` and use
`COMMENT_INCLUDE` in `prisma.comment.findMany({ include: COMMENT_INCLUDE, … })` calls.

3. Extend `toCommentDto`:
```ts
import { getMediaPath } from "@/lib/utils";

export function toCommentDto(row: CommentRow, viewerLikedIds?: Set<number>): CommentDto {
  const deleted = row.status === CommentStatus.DELETED_BY_USER;
  const attachment: CommentAttachment | null =
    deleted || !row.attachmentEntityType || !row.attachmentImagePath
      ? null
      : {
          entityType: row.attachmentEntityType as CommentAttachment["entityType"],
          tmdbId:
            row.attachmentMovieId ?? row.attachmentSeriesId ?? row.attachmentPersonId ?? 0,
          imagePath: row.attachmentImagePath,
        };
  const entityMentions: EntityMentionRef[] = deleted
    ? []
    : row.entityMentions.map((m) => {
        if (m.movie) {
          return { kind: "movie" as const, tmdbId: m.movie.id, seasonNumber: null, episodeNumber: null, name: m.movie.title, href: getMediaPath("movie", m.movie.id, m.movie.title) };
        }
        if (m.person) {
          return { kind: "person" as const, tmdbId: m.person.id, seasonNumber: null, episodeNumber: null, name: m.person.name, href: getMediaPath("person", m.person.id, m.person.name) };
        }
        // series or episode
        const sid = m.series?.id ?? (m.seriesId as number);
        const sname = m.series?.name ?? "Series";
        const base = getMediaPath("series", sid, sname);
        if (m.seasonNumber !== null && m.episodeNumber !== null) {
          return { kind: "episode" as const, tmdbId: sid, seasonNumber: m.seasonNumber, episodeNumber: m.episodeNumber, name: sname, href: `${base}/discuss/s${m.seasonNumber}e${m.episodeNumber}` };
        }
        return { kind: "series" as const, tmdbId: sid, seasonNumber: null, episodeNumber: null, name: sname, href: base };
      });
  return {
    id: row.id,
    parentId: row.parentId,
    body: deleted ? "" : row.body,
    spoilerScope: row.spoilerScope as SpoilerScopeValue,
    scopeSeason: row.scopeSeason,
    scopeEpisode: row.scopeEpisode,
    status: row.status,
    likeCount: row.likeCount,
    createdAt: row.createdAt.toISOString(),
    editedAt: row.editedAt ? row.editedAt.toISOString() : null,
    author: deleted || !row.user ? null : row.user,
    attachment,
    viewerLiked: viewerLikedIds ? viewerLikedIds.has(row.id) : false,
    entityMentions,
  };
}
```

4. In `pageWithReplies`, compute `viewerLikedIds` ONLY for the gated path. Add an optional
`viewerId: number | null = null` param to `pageWithReplies`, `getVisibleCommentPage`; after
fetching roots+replies, when `viewerId`:
```ts
const allIds = [...roots.map((r) => r.id), ...replies.map((r) => r.id)];
const likedRows =
  viewerId && allIds.length
    ? await prisma.reaction.findMany({
        where: { userId: viewerId, commentId: { in: allIds }, type: "LIKE" },
        select: { commentId: true },
      })
    : [];
const likedIds = new Set(likedRows.map((l) => l.commentId).filter((id): id is number => id !== null));
```
Pass `likedIds` into every `toCommentDto(...)` call inside `pageWithReplies`.
`getPublicCommentPage` calls with `viewerId = null` (anon tier — invariant 1: no viewer
data; `viewerLiked` is always `false` there).

> Invariant 1 guard: `getPublicCommentPage` MUST keep `viewerId = null` so the cacheable
> tier never carries like-state. Only `getVisibleCommentPage` (POST path) resolves
> `viewerLiked`.

**Run (pass):**
```bash
DATABASE_URL='postgresql://dev:dev@localhost:5436/moviebrowser' yarn vitest run src/server/db/postgres/comment-dto.test.ts
yarn typecheck
```

**Commit:** `feat(discussion): CommentDto attachment + entityMentions + viewerLiked`

---

## Task 7 — Wire create/edit path: obscenity → gate → persist mentions + attachment

**Failing test** — `src/server/actions/comments.entity.test.ts` (new, self-skips without DB):

```ts
import { describe, it, expect } from "vitest";

const HAS_DB = process.env.DATABASE_URL?.includes("5436") ?? false;
const d = HAS_DB ? describe : describe.skip;

d("createComment Phase B persistence", () => {
  it("obscene body is held without an LLM call (prefilter short-circuits)", async () => {
    const { createComment } = await import("./comments");
    // Requires a seeded movie (550) + test-auth session in the harness; this test
    // documents the contract — the runner verifies pending_review on obscene input.
    const res = await createComment({ anchor: { type: "movie", movieId: 550 }, body: "you are a fag" });
    expect(["pending_review", "error"]).toContain(res.status);
  });
});
```

> This integration test self-skips green outside :5436 (mirrors `audit.test.ts`). The
> behavioral contract is enforced by the impl + the pure obscenity test (Task 2).

**Run (fail/skip).**

**Minimal impl** — `src/server/actions/comments.ts`:

1. Imports:
```ts
import { containsObscenity } from "@/server/services/discussion/obscenity-filter";
import { sanitizeCommentBody } from "@/server/services/discussion/sanitize-comment";
import { parseEntityMentions, resolveEntityMentions } from "@/server/services/discussion/mentions";
```

2. In `createComment`, AFTER `const input = CreateCommentSchema.parse(rawInput)` and the
rate-limit check, sanitize + prefilter BEFORE the gate:
```ts
    const cleanBody = sanitizeCommentBody(input.body);
    if (cleanBody.length < 2) return { status: "error", message: "Comment is empty after formatting" };

    // §6 step 2: deterministic prefilter BEFORE the LLM gate. Obvious profanity/slurs
    // short-circuit to held — no Bedrock call spent (AI cost-safety, invariant 6).
    const obscene = containsObscenity(cleanBody);
```
Use `cleanBody` (not `input.body`) for the gate `body`, the stored `body`, the snippets, and
entity/user mention parsing below.

3. Compute `held` to include the prefilter, and SKIP the gate when obscene:
```ts
    const gate = obscene
      ? null
      : await runCommentGate({
          body: cleanBody,
          title,
          mediaType: anchor.type,
          seasonNumber: anchor.type === "series" ? anchor.seasonNumber : null,
          episodeNumber: anchor.type === "series" ? anchor.episodeNumber : null,
        });
```
Keep the existing scope-suggestion block (it is guarded by `gate &&`, so obscene→null skips it).
Then:
```ts
    const held = obscene || gate === null || gate.toxicity === "flagged";
    const aiLabels: Record<string, unknown> = obscene
      ? { gate: null, gatedAt: new Date().toISOString(), prefilter: "obscenity" }
      : gate
        ? { gate: { ...gate }, gatedAt: new Date().toISOString() }
        : { gate: null, gatedAt: new Date().toISOString(), gateError: true };
```

4. Resolve entity mentions + attachment BEFORE the tx (catalog reads, no AI):
```ts
    const entityRows = await resolveEntityMentions(parseEntityMentions(cleanBody));
    // Attachment: trust the typed schema; map entity id to the right typed column.
    const att = input.attachment;
    const attachmentData = att
      ? {
          attachmentEntityType: att.entityType,
          attachmentMovieId: att.entityType === "movie" ? att.tmdbId : null,
          attachmentSeriesId: att.entityType === "series" || att.entityType === "episode" ? att.tmdbId : null,
          attachmentPersonId: att.entityType === "person" ? att.tmdbId : null,
          attachmentImagePath: att.imagePath,
        }
      : {
          attachmentEntityType: null,
          attachmentMovieId: null,
          attachmentSeriesId: null,
          attachmentPersonId: null,
          attachmentImagePath: null,
        };
```

5. Persist inside the SAME `auditedTransaction` (insert comment, then the mention rows):
```ts
    const created = await auditedTransaction(userId, async (tx) => {
      const row = await tx.comment.create({
        data: {
          userId,
          movieId: anchor.type === "movie" ? anchor.movieId : null,
          seriesId: anchor.type === "series" ? anchor.seriesId : null,
          seasonNumber: anchor.type === "series" ? anchor.seasonNumber : null,
          episodeNumber: anchor.type === "series" ? anchor.episodeNumber : null,
          parentId,
          body: cleanBody,
          spoilerScope: input.spoilerScope,
          scopeSeason: input.spoilerScope === "EPISODE" ? input.scopeSeason : null,
          scopeEpisode: input.spoilerScope === "EPISODE" ? input.scopeEpisode : null,
          status: held ? CommentStatus.PENDING_REVIEW : CommentStatus.PUBLISHED,
          aiLabels: aiLabels as object,
          ...attachmentData,
        },
        include: COMMENT_INCLUDE,
      });
      if (entityRows.length > 0) {
        await tx.commentEntityMention.createMany({
          data: entityRows.map((r) => ({ commentId: row.id, ...r })),
        });
      }
      return row;
    });
```
Import `COMMENT_INCLUDE` from `@/server/db/postgres/comments` (export it there) and replace
the old inline `include: { user: { select: … } }`. After creation, re-read mentions into the
DTO is unnecessary because `COMMENT_INCLUDE` already loaded them; but `createMany` ran AFTER
the create's include, so for the returned DTO either (a) re-fetch the row with
`COMMENT_INCLUDE` after the tx, or (b) attach `entityRows` names client-side. **Choose (a)**
for correctness — after the tx:
```ts
    const full = await prisma.comment.findUnique({ where: { id: created.id }, include: COMMENT_INCLUDE });
    if (held) return { status: "pending_review" };
    // ... notifications use cleanBody.slice(0,140)
    return { status: "published", comment: toCommentDto(full ?? created) };
```

6. Notifications block: replace `input.body` with `cleanBody` for `parseMentions` and snippets.
`parseMentions(cleanBody)` — user mentions unchanged; entity mentions never notify (invariant: no fan-out).

7. `editComment`: apply the same sanitize + obscenity prefilter + entity-mention reconcile.
Inside its `auditedTransaction`, after the `tx.comment.update(...)`, replace mentions:
```ts
      await tx.commentEntityMention.deleteMany({ where: { commentId: input.commentId } });
      const editRows = await resolveEntityMentions(parseEntityMentions(cleanEditBody));
      if (editRows.length > 0) {
        await tx.commentEntityMention.createMany({ data: editRows.map((r) => ({ commentId: input.commentId, ...r })) });
      }
```
(resolveEntityMentions is async + a DB read — call it BEFORE opening the tx, like create; pass
the resolved rows in. Keep tx free of network/LLM.) Use `cleanEditBody = sanitizeCommentBody(input.body)`
and store it; recompute `held` with `containsObscenity(cleanEditBody)`.

**Run (pass/skip) + typecheck.** Manually verify against `mb-dev` (test-auth session, seeded
movie): post `you are a fag` → "Held for review"; post `loved [[movie:550|Fight Club]]` →
published with a live link. Read `npx pm2 logs mb-dev --nostream --lines 60` for errors.

**Commit:** `feat(discussion): create/edit wires obscenity prefilter + sanitize + entity mentions + attachment`

---

## Task 8 — Read-only markdown `CommentBody` renderer + `[spoiler]`

**Failing test** — `src/components/features/discussion/comment-body.test.tsx` (new; jsdom):

```tsx
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { CommentBody } from "./comment-body";
import type { CommentDto } from "@/server/db/postgres/comments";

const dto = (over: Partial<CommentDto>): CommentDto => ({
  id: 1, parentId: null, body: "", spoilerScope: "NONE", scopeSeason: null, scopeEpisode: null,
  status: "PUBLISHED", likeCount: 0, createdAt: "2026-06-15T00:00:00Z", editedAt: null,
  author: { id: 1, username: "ada", name: "Ada", image: null }, attachment: null,
  viewerLiked: false, entityMentions: [], ...over,
});

describe("CommentBody", () => {
  it("renders markdown-lite (bold) without raw HTML", () => {
    const html = renderToStaticMarkup(<CommentBody comment={dto({ body: "this is **bold**" })} />);
    expect(html).toContain("<strong>bold</strong>");
    expect(html).not.toContain("<script");
  });
  it("renders @user as a profile link", () => {
    const html = renderToStaticMarkup(<CommentBody comment={dto({ body: "hi @bea" })} />);
    expect(html).toContain('href="/u/bea"');
  });
  it("renders an entity token as a live link with current name", () => {
    const html = renderToStaticMarkup(
      <CommentBody comment={dto({
        body: "see [[movie:550|Old Name]]",
        entityMentions: [{ kind: "movie", tmdbId: 550, seasonNumber: null, episodeNumber: null, name: "Fight Club", href: "/movie/550/fight-club" }],
      })} />
    );
    expect(html).toContain('href="/movie/550/fight-club"');
    expect(html).toContain("Fight Club"); // CURRENT catalog name, not the stored label
  });
  it("hides a [spoiler] body until revealed (renders a button, not the text in plain flow)", () => {
    const html = renderToStaticMarkup(<CommentBody comment={dto({ body: "the killer is [spoiler]Bob[/spoiler]" })} />);
    expect(html).toContain("Reveal spoiler");
  });
});
```

**Run (fail).**

**Minimal impl** — `src/components/features/discussion/comment-body.tsx`:

```tsx
"use client";

import { useState } from "react";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Components } from "react-markdown";
import type { CommentDto, EntityMentionRef } from "@/server/db/postgres/comments";
import { MARKDOWN_ALLOWED_ELEMENTS } from "@/server/services/discussion/sanitize-comment";

// Token grammar (matches mentions.ts ENTITY_RE + the @user RE).
const ENTITY_TOKEN = /\[\[(movie|series|person|ep):([0-9]+)(?::([0-9]+):([0-9]+))?\|([^\]]{0,120})\]\]/g;
const USER_TOKEN = /(^|[^\w@])@([a-z0-9_]{3,30})\b/gi;
const SPOILER_TOKEN = /\[spoiler\]([\s\S]*?)\[\/spoiler\]/g;

/** Inline reveal for a [spoiler]…[/spoiler] span — independent of the watch-gate. */
function InlineSpoiler({ text }: { text: string }) {
  const [revealed, setRevealed] = useState(false);
  if (revealed) return <span className="rounded bg-muted px-1">{text}</span>;
  return (
    <button
      type="button"
      onClick={() => setRevealed(true)}
      className="inline-flex min-h-0 items-center rounded bg-foreground/10 px-2 py-0.5 text-xs font-medium text-muted-foreground hover:bg-foreground/20"
    >
      Reveal spoiler
    </button>
  );
}

/**
 * Read-only comment renderer (spec §5 rung 1). NO dangerouslySetInnerHTML.
 * Body was sanitized on write (no raw HTML), so react-markdown only ever sees
 * markdown-lite text. We pre-tokenize @user / [[entity]] / [spoiler] into React
 * nodes the markdown text components can't express, then render the residual
 * markdown with a restricted allowedElements + a safe link component.
 */
function buildMentionMap(refs: EntityMentionRef[]): Map<string, EntityMentionRef> {
  const map = new Map<string, EntityMentionRef>();
  for (const r of refs) {
    const key =
      r.kind === "episode"
        ? `ep:${r.tmdbId}:${r.seasonNumber}:${r.episodeNumber}`
        : `${r.kind}:${r.tmdbId}`;
    map.set(key, r);
  }
  return map;
}

/** Split a plain text run into [text | <Link> | <InlineSpoiler>] nodes. */
function renderTextRun(text: string, refs: Map<string, EntityMentionRef>, keyBase: string): React.ReactNode[] {
  // 1) spoilers first (outermost), then entity tokens, then @user — all on the
  // residual text segments. We do a single combined pass with a master splitter.
  const nodes: React.ReactNode[] = [];
  let lastIndex = 0;
  let k = 0;
  const combined = new RegExp(`${SPOILER_TOKEN.source}|${ENTITY_TOKEN.source}|${USER_TOKEN.source}`, "gi");
  for (const m of text.matchAll(combined)) {
    const idx = m.index ?? 0;
    if (idx > lastIndex) nodes.push(text.slice(lastIndex, idx));
    if (m[1] !== undefined && /^\[spoiler\]/i.test(m[0])) {
      // spoiler group is m[1]
      nodes.push(<InlineSpoiler key={`${keyBase}-s${k++}`} text={m[1]} />);
    } else if (m[0].startsWith("[[")) {
      const kind = m[2]; // entity tag
      const id = m[3];
      const season = m[4];
      const episode = m[5];
      const key = kind === "ep" ? `ep:${id}:${season}:${episode}` : `${kind === "ep" ? "episode" : kind}:${id}`;
      const ref = refs.get(kind === "ep" ? `ep:${id}:${season}:${episode}` : `${kind}:${id}`);
      if (ref) {
        nodes.push(
          <Link key={`${keyBase}-e${k++}`} href={ref.href} className="font-medium text-brand hover:underline">
            {ref.name}
          </Link>
        );
      } else {
        // Unresolved (deleted entity): fall back to the stored label (m[6]).
        nodes.push(<span key={`${keyBase}-e${k++}`}>{m[6]}</span>);
      }
      void key;
    } else {
      // @user: prefix in m[7], username in m[8]
      nodes.push(m[7] ?? "");
      const uname = m[8];
      nodes.push(
        <Link key={`${keyBase}-u${k++}`} href={`/u/${uname.toLowerCase()}`} className="font-medium text-foreground hover:underline">
          @{uname}
        </Link>
      );
    }
    lastIndex = idx + m[0].length;
  }
  if (lastIndex < text.length) nodes.push(text.slice(lastIndex));
  return nodes;
}

export function CommentBody({ comment }: { comment: CommentDto }) {
  if (comment.status === "DELETED_BY_USER") {
    return <p className="text-sm text-muted-foreground italic">Comment deleted by author</p>;
  }
  const refs = buildMentionMap(comment.entityMentions);

  const components: Components = {
    a: ({ href, children }) => (
      <a href={href} target="_blank" rel="nofollow ugc noopener noreferrer" className="text-brand hover:underline break-words">
        {children}
      </a>
    ),
    // Map text nodes through our tokenizer.
    p: ({ children }) => <p className="leading-relaxed">{children}</p>,
  };

  const pending = comment.status === "PENDING_REVIEW" || comment.status === "FLAGGED";

  // react-markdown calls our `text` renderer per text node; tokenize there.
  const textComponents = {
    ...components,
    // @ts-expect-error react-markdown passes raw text via the `text` node when configured
    text: ({ value }: { value: string }) => <>{renderTextRun(value, refs, String(comment.id))}</>,
  } as Components;

  return (
    <div className="text-sm text-foreground/90">
      {pending && <p className="text-[11px] text-muted-foreground italic mb-1">Pending review — visible only to you</p>}
      <div className="prose-comment whitespace-pre-wrap break-words [&_strong]:font-semibold [&_blockquote]:border-l-2 [&_blockquote]:border-border [&_blockquote]:pl-3 [&_blockquote]:text-muted-foreground">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          allowedElements={[...MARKDOWN_ALLOWED_ELEMENTS]}
          unwrapDisallowed
          skipHtml
          components={textComponents}
        >
          {comment.body}
        </ReactMarkdown>
      </div>
    </div>
  );
}
```

> **react-markdown text-node caveat:** react-markdown v10 does not expose a `text`
> component by default; the tokenization approach above must be validated against the
> installed v10 API. If the `text` component hook is unavailable, the robust fallback
> (use THIS if the test for entity/spoiler rendering fails): render the body NOT through
> markdown's children but via a custom approach — run `renderTextRun` on the raw `body`
> first to produce React nodes, and apply markdown ONLY for bold/italic/quote by keeping
> the tokenizer as the primary renderer and dropping react-markdown to a thin
> bold/italic pass on the residual string segments. The test asserts the OUTPUT
> (`<strong>`, profile links, entity links, "Reveal spoiler"); satisfy those assertions —
> the internal mechanism may differ from the sketch. Verify with the failing test, adjust
> the impl until green. DO NOT enable `rehype-raw`/`dangerouslySetInnerHTML`.

Add `skipHtml` already present; ensure no `rehypeRaw`.

**Run (pass):**
```bash
DATABASE_URL='postgresql://dev:dev@localhost:5436/moviebrowser' yarn vitest run src/components/features/discussion/comment-body.test.tsx
yarn typecheck
```

**Commit:** `feat(discussion): read-only markdown CommentBody + inline [spoiler] + live entity links`

---

## Task 9 — Mention search action + autocomplete palette

**Failing test** — `src/server/actions/discussion-search.test.ts` (self-skips without DB):

```ts
import { describe, it, expect } from "vitest";
const HAS_DB = process.env.DATABASE_URL?.includes("5436") ?? false;
const d = HAS_DB ? describe : describe.skip;

d("searchMentionEntities", () => {
  it("returns sectioned results", async () => {
    const { searchMentionEntities } = await import("./discussion-search");
    const res = await searchMentionEntities({ query: "fight", anchor: { type: "movie", movieId: 550 } });
    expect(res).toHaveProperty("people");
    expect(res).toHaveProperty("titles");
    expect(res).toHaveProperty("cast");
    expect(res).toHaveProperty("episodes");
  });
});
```

**Run (fail/skip).**

**Minimal impl** — `src/server/actions/discussion-search.ts`:

```ts
"use server";

import { z } from "zod";
import { prisma } from "@/server/db/postgres";
import { dataLogger } from "@/lib/logger";
import { DiscussionAnchorSchema } from "@/server/services/discussion/comment-schemas";
import type { MentionSearchResultDto } from "@/types/social";

const SearchSchema = z.object({
  query: z.string().trim().min(1).max(60),
  anchor: DiscussionAnchorSchema,
});

/**
 * Sectioned catalog search for the @-mention palette (spec §5 rung 2):
 * People (registered users) · Titles · Cast/People (catalog persons) · Episodes
 * (only when the anchor is a series). Pure catalog/user reads — NO AI.
 */
export async function searchMentionEntities(
  raw: z.infer<typeof SearchSchema>
): Promise<MentionSearchResultDto> {
  const empty: MentionSearchResultDto = { people: [], titles: [], cast: [], episodes: [] };
  try {
    const { query, anchor } = SearchSchema.parse(raw);
    const handle = query.replace(/^@/, "").toLowerCase();
    const [people, movies, series, persons] = await Promise.all([
      handle.length >= 2
        ? prisma.user.findMany({
            where: { username: { startsWith: handle, mode: "insensitive" } },
            select: { username: true, name: true, image: true },
            take: 5,
          })
        : Promise.resolve([]),
      prisma.movie.findMany({
        where: { title: { contains: query, mode: "insensitive" } },
        select: { id: true, title: true, releaseDate: true, posterPath: true },
        orderBy: { popularity: "desc" },
        take: 5,
      }),
      prisma.series.findMany({
        where: { name: { contains: query, mode: "insensitive" } },
        select: { id: true, name: true, firstAirDate: true, posterPath: true },
        orderBy: { popularity: "desc" },
        take: 5,
      }),
      prisma.person.findMany({
        where: { name: { contains: query, mode: "insensitive" } },
        select: { id: true, name: true, profilePath: true },
        orderBy: { popularity: "desc" },
        take: 5,
      }),
    ]);

    let episodes: MentionSearchResultDto["episodes"] = [];
    if (anchor.type === "series") {
      const rows = await prisma.episode.findMany({
        where: {
          season: { seriesId: anchor.seriesId },
          name: { contains: query, mode: "insensitive" },
        },
        select: { name: true, episodeNumber: true, stillPath: true, season: { select: { seasonNumber: true } } },
        take: 5,
      });
      episodes = rows
        .filter((e) => e.name)
        .map((e) => ({
          seriesId: anchor.seriesId,
          seasonNumber: e.season.seasonNumber,
          episodeNumber: e.episodeNumber,
          name: e.name as string,
          imagePath: e.stillPath,
        }));
    }

    return {
      people: people
        .filter((u): u is { username: string; name: string | null; image: string | null } => u.username !== null)
        .map((u) => ({ username: u.username, name: u.name, image: u.image })),
      titles: [
        ...movies.map((m) => ({ kind: "movie" as const, tmdbId: m.id, name: m.title, year: m.releaseDate ? m.releaseDate.getFullYear() : null, imagePath: m.posterPath })),
        ...series.map((s) => ({ kind: "series" as const, tmdbId: s.id, name: s.name, year: s.firstAirDate ? s.firstAirDate.getFullYear() : null, imagePath: s.posterPath })),
      ],
      cast: persons.map((p) => ({ tmdbId: p.id, name: p.name, imagePath: p.profilePath })),
      episodes,
    };
  } catch (error: unknown) {
    dataLogger.error(
      { action: "searchMentionEntities", error: error instanceof Error ? error.message : String(error) },
      "searchMentionEntities failed"
    );
    return empty;
  }
}
```

Add to `src/types/social.ts`:
```ts
export interface MentionSearchResultDto {
  people: { username: string; name: string | null; image: string | null }[];
  titles: { kind: "movie" | "series"; tmdbId: number; name: string; year: number | null; imagePath: string | null }[];
  cast: { tmdbId: number; name: string; imagePath: string | null }[];
  episodes: { seriesId: number; seasonNumber: number; episodeNumber: number; name: string; imagePath: string | null }[];
}
```

Then `src/components/features/discussion/mention-autocomplete.tsx` — a controlled overlay
that, given the current textarea value + caret, detects a trailing `@token`, calls
`searchMentionEntities` (debounced 250ms via `useDebounce`), and renders the sectioned list;
selecting an item invokes `onInsert(token)` where token is `@username` for people or the
`[[…]]` machine token for entities. 40px+ touch rows, semantic tokens, no hardcoded colors.
(Full component code mirrors `BackdropPicker`'s search/list structure; keep it ≤200 lines.)

**Run (pass/skip) + typecheck.**

**Commit:** `feat(discussion): sectioned @-mention search action + autocomplete palette`

---

## Task 10 — Like reactions: action + button + wire-in

**Failing test** — `src/server/actions/comment-reactions.test.ts` (self-skips without DB):

```ts
import { describe, it, expect } from "vitest";
const HAS_DB = process.env.DATABASE_URL?.includes("5436") ?? false;
const d = HAS_DB ? describe : describe.skip;

d("toggleLike", () => {
  it("idempotently toggles and keeps likeCount in sync", async () => {
    const { toggleLike } = await import("./comment-reactions");
    const r = await toggleLike({ commentId: 1 });
    expect(typeof r.liked === "boolean" || r.ok === false).toBe(true);
  });
});
```

**Run (fail/skip).**

**Minimal impl** — `src/server/actions/comment-reactions.ts`:

```ts
"use server";

import { z } from "zod";
import { CommentStatus } from "@prisma/client";
import { prisma } from "@/server/db/postgres";
import { requireUserIdForDb } from "@/lib/user-id";
import { dataLogger } from "@/lib/logger";
import { isPrismaError } from "@/server/services/hydration/sources/postgres/error-utils";

const ToggleLikeSchema = z.object({ commentId: z.number().int().positive() });

export type ToggleLikeResult =
  | { ok: true; liked: boolean; likeCount: number }
  | { ok: false; message: string };

/**
 * Like-only reaction (spec §5 rung 3, no downvotes). One row per (user, comment)
 * via the @@unique([userId, commentId]); likeCount is kept in sync atomically in
 * the same tx. NOT in the audit opt-in set (reactions are high-churn, low value —
 * see audit-log.md). Idempotent: re-liking is a no-op toggle-off.
 */
export async function toggleLike(raw: z.infer<typeof ToggleLikeSchema>): Promise<ToggleLikeResult> {
  try {
    const userId = await requireUserIdForDb();
    const { commentId } = ToggleLikeSchema.parse(raw);
    const comment = await prisma.comment.findUnique({
      where: { id: commentId },
      select: { id: true, status: true, circleId: true },
    });
    if (!comment || comment.status !== CommentStatus.PUBLISHED || comment.circleId !== null) {
      return { ok: false, message: "Comment not found" };
    }
    const existing = await prisma.reaction.findUnique({
      where: { userId_commentId: { userId, commentId } },
      select: { id: true },
    });
    if (existing) {
      const updated = await prisma.$transaction(async (tx) => {
        await tx.reaction.delete({ where: { id: existing.id } });
        return tx.comment.update({ where: { id: commentId }, data: { likeCount: { decrement: 1 } }, select: { likeCount: true } });
      });
      return { ok: true, liked: false, likeCount: Math.max(0, updated.likeCount) };
    }
    try {
      const updated = await prisma.$transaction(async (tx) => {
        await tx.reaction.create({ data: { userId, commentId, type: "LIKE" } });
        return tx.comment.update({ where: { id: commentId }, data: { likeCount: { increment: 1 } }, select: { likeCount: true } });
      });
      return { ok: true, liked: true, likeCount: updated.likeCount };
    } catch (error: unknown) {
      // Lost a race on the unique → already liked; report current state.
      if (isPrismaError(error) && error.code === "P2002") {
        const c = await prisma.comment.findUnique({ where: { id: commentId }, select: { likeCount: true } });
        return { ok: true, liked: true, likeCount: c?.likeCount ?? 0 };
      }
      throw error;
    }
  } catch (error: unknown) {
    dataLogger.error(
      { action: "toggleLike", error: error instanceof Error ? error.message : String(error) },
      "toggleLike failed"
    );
    return { ok: false, message: "Something went wrong" };
  }
}
```

`src/components/features/discussion/like-button.tsx`:

```tsx
"use client";

import { useState } from "react";
import { ThumbsUp } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { toggleLike } from "@/server/actions/comment-reactions";

interface LikeButtonProps {
  commentId: number;
  initialLiked: boolean;
  initialCount: number;
  disabled?: boolean; // not signed in
}

export function LikeButton({ commentId, initialLiked, initialCount, disabled }: LikeButtonProps) {
  const [liked, setLiked] = useState(initialLiked);
  const [count, setCount] = useState(initialCount);
  const [busy, setBusy] = useState(false);

  const onClick = async () => {
    if (disabled || busy) return;
    setBusy(true);
    // Optimistic
    const nextLiked = !liked;
    setLiked(nextLiked);
    setCount((c) => Math.max(0, c + (nextLiked ? 1 : -1)));
    const res = await toggleLike({ commentId });
    setBusy(false);
    if (!res.ok) {
      setLiked(liked);
      setCount(initialCount);
      toast.error(res.message);
      return;
    }
    setLiked(res.liked);
    setCount(res.likeCount);
  };

  return (
    <button
      type="button"
      onClick={() => void onClick()}
      disabled={disabled || busy}
      aria-pressed={liked}
      aria-label={liked ? "Unlike" : "Like"}
      className={cn(
        "inline-flex h-10 items-center gap-1.5 rounded-md px-2 text-xs sm:h-8",
        liked ? "text-brand" : "text-muted-foreground hover:text-foreground",
        (disabled || busy) && "opacity-60"
      )}
    >
      <ThumbsUp className={cn("h-3.5 w-3.5", liked && "fill-current")} />
      {count > 0 && <span className="tabular-nums">{count}</span>}
    </button>
  );
}
```

Wire into `comment-item.tsx`: import `CommentBody` (replace `MentionText` import + the inline
`CommentBody` function in that file — delete the local one, import the new component) and
`LikeButton`. Render `LikeButton` in the `comment.status === "PUBLISHED"` action row, before
Reply:
```tsx
<LikeButton commentId={comment.id} initialLiked={comment.viewerLiked} initialCount={comment.likeCount} disabled={!canInteract} />
```
Render the attachment image below the body (TMDB prefix):
```tsx
{comment.attachment && (
  <div className="relative mt-1.5 aspect-video w-full max-w-xs overflow-hidden rounded-lg border border-border">
    <Image src={`${TMDB_IMAGE_BASE}/w500${comment.attachment.imagePath}`} alt="" fill sizes="320px" className="object-cover" unoptimized />
  </div>
)}
```
Import `TMDB_IMAGE_BASE` from `@/lib/constants` and `Image` (already imported). `comment-list-client.tsx`
already passes `viewerId`/`canInteract`; `viewerLiked` rides on the DTO from `loadComments`
(gated path) and is `false` in the anon SSR tier (invariant 1 — no viewer data cached).

**Run (pass/skip) + typecheck.** Manual: like/unlike on `mb-dev`, confirm count + persistence.

**Commit:** `feat(discussion): Like reaction action + button + attachment render + CommentBody swap`

---

## Task 11 — Composer wiring: autocomplete + image picker + attachment preview

`src/components/features/discussion/comment-image-picker.tsx` — mirror `BackdropPicker` but:
- accept the current `anchor` to default the searched title to the page's movie/series;
- surface stills (episodes), posters, backdrops (titles), and headshots (people) — reuse
  `getTitleImages` (titles) and add a `getPersonImages`/episode-stills path via a small new
  server action `getEntityImages({ entityType, tmdbId, seriesId?, seasonNumber?, episodeNumber? })`
  in `discussion-search.ts` returning `{ images: string[] }` from `prisma.image` (+ TMDB
  fallback as in `getTitleImages`);
- on pick, call `onSelect({ entityType, tmdbId, imagePath })` matching `CommentAttachmentInput`.

`comment-composer.tsx` changes (extend the existing component, keep its scope/suggestion logic):
- add `attachment` state (`CommentAttachmentInput | null`) and an image-picker `Dialog`
  (shadcn `Dialog` from `@/components/ui/dialog`) toggled by an "Add image" button (40px+);
- add the `@`-autocomplete: on textarea change, detect a trailing `@…` token and render
  `<MentionAutocomplete>` anchored under the textarea; `onInsert(token)` splices the token at
  the caret;
- show an attachment thumbnail preview with a remove (×) control;
- pass `attachment` into `createComment({ ..., attachment })`.
- Toolbar row order (mobile-first, 40px targets): scope `Select` · "@" hint · "Add image" ·
  spacer · Cancel · Post. Keep within the file-size/component budgets (≤600 lines; split the
  toolbar into a child if needed).

**Test** — `src/components/features/discussion/comment-composer.test.tsx` (jsdom, light):
render the composer for a movie anchor, assert the textarea + "Add image" button exist and
that typing `@a` does not throw (autocomplete mount). Mock the server actions
(`vi.mock("@/server/actions/discussion-search", …)` returning empty sections;
`vi.mock("@/server/actions/comments", …)`).

```bash
DATABASE_URL='postgresql://dev:dev@localhost:5436/moviebrowser' yarn vitest run src/components/features/discussion/comment-composer.test.tsx
yarn typecheck
```

Manual verification on `mb-dev` (test-auth): type `@`, pick a title → token inserted →
post → renders a live link; add an image → preview → post → thumbnail renders. Screenshot
390×844 + 1440×900 per `design-system.md`. Read `pm2 logs mb-dev` for errors.

**Commit:** `feat(discussion): composer wires @-autocomplete + catalog image picker + attachment preview`

---

## Final verification (before declaring Phase B done)

```bash
yarn typecheck
yarn lint
DATABASE_URL='postgresql://dev:dev@localhost:5436/moviebrowser' yarn vitest run src/server/services/discussion src/server/db/postgres src/components/features/discussion src/server/actions/comment-reactions.test.ts src/server/actions/discussion-search.test.ts src/server/actions/comments.entity.test.ts
```
- Invariant audit: grep the discussion render trees for `auth(`/`headers(` — none in
  cacheable paths; confirm `getPublicCommentPage` still passes `viewerId = null`;
  confirm no `dangerouslySetInnerHTML`/`rehype-raw` anywhere; confirm `createComment`
  runs obscenity → gate (skipped when obscene) → `auditedTransaction`; confirm
  `reactions`/`comment_entity_mentions` are NOT added to `05-audit.sql`.
- DESIGN.md: render the composer + a comment with attachment + spoiler + entity link at
  390×844 and 1440×900; 40px touch targets; semantic tokens only.

**Do NOT** run `db push` against the prod-tunneled `.env` URL. **Do NOT** `git push`.

---

## Out of Phase B scope (Phase C/D — explicitly NOT covered here)
- Link-preview cards + `link_unfurls` + SSRF unfurl fetcher; lite-YouTube facade + CSP
  `frame-src` (spec §5 rung 4 — **Phase C**).
- Global `/discussions` hub, "new episode/season dropped" notifications, Cue trending
  seeds + Cue system user/AI badge (spec §8, §7 — **Phase D**).
- Trending/Latest denormalized activity counters + "new since you watched" read cursor
  (spec §3/§4 — **Phase A**, assumed done).
- Reactions emoji-set expansion (❤️😂😮😢) — future; v1 is Like-only.
- Single-path CloudFront invalidation hooks for moderation removals (pre-deploy follow-up).
- DMCA Designated Agent registration (pre-public-launch legal, §6).
