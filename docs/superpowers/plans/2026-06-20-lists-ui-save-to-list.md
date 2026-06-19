# Lists UI — Save-to-List Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. UI tasks (7–11) MUST be built through the `frontend-design` skill.

**Goal:** Turn the "Add to watchlist" button into an adaptive **Save** control: one-tap Watchlist (the fast path) plus a picker to save a title to any custom list, create a new list inline, and finally make lists viewable/manageable via `/lists` and `/u/[username]/list/[slug]`.

**Architecture:** Watchlist KEEPS its own `watchlist` table + REST/Zustand path (no migration — decision locked 2026-06-20). The picker is a thin UI layer that reconciles **two backends** into one optimistic view: watchlist (Zustand store, REST) + custom lists (server actions). All list access routes through a new `canViewList`/`canEditList` seam so Phase 3 circles/collaborators slot in by widening one helper — not a rewrite. All ISR-cached surfaces hydrate viewer state client-side (edge-cache invariant). List mutations move onto `auditedTransaction` (social invariant #5, currently violated).

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript strict, Prisma 6, Zustand, shadcn/ui (Vaul `Drawer`, `Popover`, `Checkbox`, `Command`, `ScrollArea`), Tailwind v4, Framer Motion, Vitest, Playwright.

**Branch:** create `feat/lists-ui` off `next` BEFORE any work. NEVER push to origin (push to `next` auto-deploys to prod). Checkpoint with `git push . HEAD:master` only if desired.

**Local dev:** DB on `:5436`, app under PM2 `mb-dev`. Pin `DATABASE_URL='postgresql://dev:dev@localhost:5436/moviebrowser'` on every prisma/psql/vitest command. After any schema/prisma change: `npx pm2 restart mb-dev`.

---

## Decisions locked (2026-06-20)

1. **Watchlist model:** keep `watchlist` table; UI-unify only (Watchlist = privileged first row in picker). No migration.
2. **Auto-remove from Watchlist on watched:** YES — **already implemented** (`watch-events.ts:224-226` for movies; `recomputeSeriesProgress` for series). This plan only adds a regression-locking test. **Custom lists NEVER auto-remove** (Letterboxd model).
3. **Scope:** save-to-list picker AND list pages (`/lists` browse + `/u/[username]/list/[slug]` detail).
4. **Control shape:** split button — primary `Watchlist` (one-tap optimistic toggle) + always-visible caret (≥44px) opening the picker. Caret is always visible (NN/g discoverability); the picker is what adapts (empty-state vs. populated).
5. **Picker selection model:** multi-select checkboxes (an item can be in Watchlist + N lists at once). Optimistic per-toggle commit, no "Done" button.
6. **Forward-compat:** all list reads/writes go through `canViewList`/`canEditList`. v1 surfaces only single-owner personal lists; no "collaborative"/"group" UI (no backend yet).

---

## Review corrections (2026-06-20) — AUTHORITATIVE, supersede conflicting task text

Two independent plan reviews (architectural + adversarial) verified every load-bearing claim against the code. **No `"use server"` or catch-all build-breaker exists** — `src/app/u/[username]` is a STATIC segment (nested `list/[slug]` is legal, no Turbopack panic, `media-resolver.ts` 308-canonicalizer never touches `/u/*`), `auditedTransaction(actorId, fn)` exists at `src/server/db/audit.ts:39` with the assumed signature, and all Prisma fields referenced exist. The following corrections are LAW where they conflict with a task below:

**C1 — `list_items` is NOT audited today; ADD the trigger (don't just assert it).** `postgres/init/05-audit.sql` audits `lists` but has no `trg_audit_list_items`. Decision: **audit `list_items`** (user-action-bounded, low-churn — NOT a hydration/catalog table, so it's safe per audit-log.md). In Task 3, add to `05-audit.sql`:
```sql
DROP TRIGGER IF EXISTS trg_audit_list_items ON list_items;
CREATE TRIGGER trg_audit_list_items
  AFTER INSERT OR UPDATE OR DELETE ON list_items
  FOR EACH ROW EXECUTE FUNCTION audit.if_modified('');
```
(First VERIFY the `@@map` table name for `ListItem` in schema.prisma — use the real mapped name.) The deploy gate combines `md5(05-audit.sql + schema.prisma)` so editing the SQL auto-re-fires it. Also add `list_items` to the audited-set docs in `.claude/rules/audit-log.md` and social invariant #5 in `social-features.md`. Run `scripts/apply-audit.ts` against :5436.

**C2 — `createList` MUST wrap `auditedTransaction` PER-ATTEMPT (not the whole retry loop).** A P2002 inside one interactive transaction aborts that transaction; the loop's next `create` on a dead tx errors. Correct form:
```typescript
export async function createList(ownerId: number, input: CreateListInput) {
  const base = slugify(input.name);
  for (let attempt = 0; attempt < 5; attempt++) {
    const slug = attempt === 0 ? base : `${base}-${attempt + 1}`;
    try {
      return await auditedTransaction(ownerId, (tx) =>
        tx.list.create({ data: {
          ownerId, name: input.name, slug,
          description: input.description ?? null,
          isPublic: input.isPublic ?? false,
          isRanked: input.isRanked ?? false,
          kind: input.kind ?? "REGULAR",
        } })
      );
    } catch (error: unknown) {
      if (isPrismaError(error) && error.code === "P2002") continue;
      throw error;
    }
  }
  throw new Error("Could not generate a unique list slug");
}
```
Note in Task 3: `moveListItem` (pure reorder) writes no `lists` row, so it produces NO `lists` audit row — that's by design; don't write a `lists` audit assertion for it (with C1, the `list_items` UPDATEs it makes WILL audit).

**C3 — New query fns take `db: Db = prisma` so they're unit-testable with an injected fake** (the existing social-test convention, e.g. `ratings.set.test.ts`; NOT the live-DB `audit.test.ts` style). Apply to `canViewList`, `canEditList`, `getItemListMembership`. Logic tests inject a fake `Db`; the audit-actor test (Task 3) genuinely needs triggers → keep THAT one live-:5436-gated and have it seed its own FK targets (users + movies 603/604 — **604 is NOT in the seed**, so the test must create the movie rows it needs idempotently, or the `WatchlistItem.movieId`/`WatchEvent.movieId` FK insert throws before any assertion). `Db` type: import from the same place `setFourFavorites` does (`lists.ts` already references `Prisma.TransactionClient` — reuse that alias).

**C4 — ONE membership row type, shared.** Export `ListMembershipRow` (incl. `kind`) from `lists.ts` (db module). The hook imports it **type-only**: `import type { ListMembershipRow } from "@/server/db/postgres/social/lists"` then `type MembershipRow = ListMembershipRow & { pending?: boolean }`. (Type-only import from a prisma-touching module into a `"use client"` hook is erased at compile — safe.) Delete the duplicate inline `MembershipRow` definition in Task 5. Strengthen the Task 2 membership test: seed OWNER a FOUR_FAVORITES list too, then assert `rows.every(r => r.kind === "REGULAR")` and `rows.length === <regular count>` (FF excluded) — not the tautological `.some(... === "FOUR_FAVORITES")`.

**C5 — `getList` must NOT double-fetch.** Add a pure predicate to `lists.ts` (db module, NOT `"use server"`):
```typescript
export function isListViewable(list: { ownerId: number; isPublic: boolean }, viewerId: number | null): boolean {
  return list.isPublic || (viewerId != null && list.ownerId === viewerId);
}
```
`canViewList`/`canEditList` fetch then delegate to the pure predicate; the `getList` ACTION calls `getListWithItems(listId)` once, then `isListViewable(list, userId)` — no extra query. (PHASE-3 seam still lives in `canViewList`/`canEditList` + `isListViewable`.)

**C6 — `useListMembership.toggle`: serialize per-list with a synchronous ref guard, read rows via ref (not closure).** This fixes the rapid-double-tap race AND the pending-add-then-toggle-off orphan. Replaces the Task 5 hook body:
```typescript
const [rows, setRows] = useState<MembershipRow[]>([]);
const rowsRef = useRef<MembershipRow[]>([]);
useEffect(() => { rowsRef.current = rows; }, [rows]);
const inFlight = useRef<Set<number>>(new Set());

const toggle = useCallback(async (listId: number) => {
  if (inFlight.current.has(listId)) return;          // synchronous guard
  const row = rowsRef.current.find((r) => r.listId === listId);
  if (!row) return;
  inFlight.current.add(listId);
  const wasIn = row.contains;
  setRows((prev) => prev.map((r) => (r.listId === listId ? { ...r, contains: !wasIn, pending: true } : r)));
  try {
    if (wasIn && row.itemId != null) {
      const res = await removeListItem({ listId, itemId: row.itemId });
      if (!res.success) throw new Error(res.error);
      setRows((prev) => prev.map((r) => (r.listId === listId ? { ...r, contains: false, itemId: null, pending: false, itemCount: Math.max(0, r.itemCount - 1) } : r)));
    } else if (!wasIn) {
      const res = await addListItem({ listId, item: toRef(itemId, mediaType) });
      if (!res.success) throw new Error(res.error);
      setRows((prev) => prev.map((r) => (r.listId === listId ? { ...r, contains: true, itemId: res.itemId ?? null, pending: false, itemCount: r.itemCount + 1 } : r)));
    } else {
      setRows((prev) => prev.map((r) => (r.listId === listId ? { ...r, pending: false } : r))); // wasIn but itemId not yet known: no-op
    }
  } catch (e: unknown) {
    setRows((prev) => prev.map((r) => (r.listId === listId ? { ...r, contains: wasIn, pending: false } : r)));
    toast.error("Couldn't update list", { description: e instanceof Error ? e.message : undefined });
  } finally {
    inFlight.current.delete(listId);
  }
}, [itemId, mediaType]); // stable: rows read via rowsRef
```

**C7 — Watchlist row in the sheet:** reads checked state from the live `isInWatchlist` prop (reactive to Zustand revert) and keeps its OWN local `pending` boolean while `onToggleWatchlist()` awaits (so it shows a spinner like custom rows). **Do NOT add a sheet-level toast** for watchlist — `useUserLibrary.toggleWatchlist` already toasts; a second would double-fire. The SaveButton's `useUserLibrary` call is positional: `useUserLibrary(itemId, mediaType)` (the hook's docstring example showing an object arg is wrong — ignore it).

**C8 — `getPublicListBySlug` excludes Four-Favorites:** `where: { ownerId, slug, isPublic: true, kind: "REGULAR" }` (FF has its own profile board; don't double-surface it). Accepted v1 decision: a public REGULAR list under a later-privated profile still renders (the list's own `isPublic` is the SEO contract — mirrors reviews' `noneScopeOnly` precedent).

**C9 — `posterPath` threading is best-effort, NOT blocking.** `posterPath` is optional on `SaveButton`/sheet; the picker header degrades to title-only when absent. Task 7: thread it from whichever of `media-action-bar.tsx`/`media-hero.tsx`/`media-overview.tsx`/`more-actions.tsx` already has it in scope; where it isn't trivially available, pass `null` and move on — do not block the feature on plumbing a poster everywhere.

---

## File Structure

**Backend (new + modified):**
- Modify `src/server/db/postgres/social/lists.ts` — add access-check seam (`canViewList`, `canEditList`), add `getItemListMembership`, move mutations to `auditedTransaction`.
- Modify `src/server/actions/lists.ts` — add `getItemListMembership` action; `getList` routes through `canViewList`.
- Create `src/server/db/postgres/social/lists.test.ts` (or extend existing) — membership + access-seam + audit tests.
- Create `src/server/db/postgres/social/watch-events-watchlist.test.ts` — regression lock for auto-remove.

**Client state:**
- Create `src/hooks/use-my-lists.ts` — fetches `getMyLists` once per open, exposes optimistic `createList`.
- Create `src/hooks/use-list-membership.ts` — per-(item) membership fetch + optimistic toggle against list actions.

**Frontend (frontend-design skill):**
- Create `src/components/features/lists/save-to-list-sheet.tsx` — responsive Drawer(mobile)/Popover(desktop) picker.
- Create `src/components/features/lists/save-button.tsx` — split control (Watchlist + caret).
- Modify `src/components/features/media/media-actions.tsx` — swap watchlist button → `SaveButton` (hero + compact).
- Modify `src/components/features/movie/movie-card-actions.tsx` — swap watchlist button → `SaveButton` (card variant).
- Create `src/components/features/lists/list-poster-stack.tsx` — overlaid-poster list cover (shared by widget + pages).
- Create `src/components/features/lists/list-card.tsx` — a list tile for the browse grid.
- Create `src/components/features/lists/list-detail-client.tsx` — owner edit island (rename, reorder, delete, privacy toggle).
- Create `src/components/features/lists/create-list-dialog.tsx` — responsive create form (reused by sheet + /lists).
- Create `src/app/lists/page.tsx` — my-lists browse (auth-gated, dynamic).
- Create `src/app/u/[username]/list/[slug]/page.tsx` — public list detail (ISR, `generateStaticParams`=>[]).
- Create `src/server/db/postgres/social/public-list.ts` — `getPublicListBySlug(username, slug)` for the ISR page.
- Modify nav: add "Lists" entry (desktop user menu + mobile, mirroring Diary/Stats T16 wiring).

---

## Task 1: Access-check seam (`canViewList` / `canEditList`)

The forward-compat fold-in. Today ownership is inlined (`requireOwnedList`, and `getList`'s `!isPublic && ownerId !== userId`). Funnel both through two helpers so Phase 3 extends ONLY these.

**Files:**
- Modify: `src/server/db/postgres/social/lists.ts`
- Test: `src/server/db/postgres/social/lists.test.ts`

- [ ] **Step 1: Write failing test** — `lists.test.ts` (self-skips if no live :5436 DB, mirroring `audit.test.ts`):

```typescript
import { describe, it, expect } from "vitest";
import { canViewList, canEditList } from "./lists";
// helper seeds: ownerId=1 with one private list L_priv and one public list L_pub; viewer=2

describe("list access seam", () => {
  it("owner can view + edit own private list", async () => {
    expect(await canViewList(L_priv.id, OWNER)).toBe(true);
    expect(await canEditList(L_priv.id, OWNER)).toBe(true);
  });
  it("stranger cannot view a private list", async () => {
    expect(await canViewList(L_priv.id, STRANGER)).toBe(false);
    expect(await canEditList(L_priv.id, STRANGER)).toBe(false);
  });
  it("stranger can view but not edit a public list", async () => {
    expect(await canViewList(L_pub.id, STRANGER)).toBe(true);
    expect(await canEditList(L_pub.id, STRANGER)).toBe(false);
  });
  it("anon (null viewer) can view public, not private", async () => {
    expect(await canViewList(L_pub.id, null)).toBe(true);
    expect(await canViewList(L_priv.id, null)).toBe(false);
  });
});
```

- [ ] **Step 2: Run, verify it fails** — `DATABASE_URL='postgresql://dev:dev@localhost:5436/moviebrowser' npx vitest run src/server/db/postgres/social/lists.test.ts` → FAIL (`canViewList` not exported).

- [ ] **Step 3: Implement the seam** in `lists.ts`:

```typescript
/**
 * Single choke point for list visibility. PHASE-3 SEAM: when circles land,
 * extend ONLY this (and canEditList) to also allow circle members /
 * ListCollaborator rows — do NOT inline ownerId checks at call sites.
 */
export async function canViewList(listId: number, viewerId: number | null): Promise<boolean> {
  const list = await prisma.list.findUnique({
    where: { id: listId },
    select: { ownerId: true, isPublic: true /* PHASE 3: circleId */ },
  });
  if (!list) return false;
  if (list.isPublic) return true;
  return viewerId != null && list.ownerId === viewerId;
}

/** PHASE-3 SEAM: widen to circle ADMIN/OWNER + collaborators with edit perm. */
export async function canEditList(listId: number, viewerId: number | null): Promise<boolean> {
  if (viewerId == null) return false;
  const list = await prisma.list.findUnique({
    where: { id: listId },
    select: { ownerId: true /* PHASE 3: circleId, isCollaborative */ },
  });
  return !!list && list.ownerId === viewerId;
}
```

- [ ] **Step 4: Route `requireOwnedList` through `canEditList`** — keep `requireOwnedList` (it returns `{id,kind,itemCount}` the mutations need) but make it call the seam first:

```typescript
async function requireOwnedList(ownerId: number, listId: number) {
  if (!(await canEditList(listId, ownerId))) throw new Error("List not found");
  const list = await prisma.list.findUnique({
    where: { id: listId },
    select: { id: true, kind: true, itemCount: true },
  });
  if (!list) throw new Error("List not found");
  return list;
}
```

- [ ] **Step 5: Run test, verify PASS.** Then `git add -A && git commit -m "feat(lists): access-check seam (canViewList/canEditList) — Phase 3 forward-compat"`.

---

## Task 2: `getItemListMembership` (which of my lists hold this title)

The picker needs: the user's lists + which already contain the item + the `ListItem.id` for each (so a toggle-off can call `removeListItem`, which needs the row id, not the movie ref).

**Files:**
- Modify: `src/server/db/postgres/social/lists.ts`
- Modify: `src/server/actions/lists.ts`
- Test: `src/server/db/postgres/social/lists.test.ts`

- [ ] **Step 1: Failing test** — appends to `lists.test.ts`:

```typescript
import { getItemListMembership } from "./lists";

it("returns each owned list with membership + itemId for the ref", async () => {
  // OWNER has L1 (contains movie 550), L2 (empty). FOUR_FAVORITES excluded.
  const rows = await getItemListMembership(OWNER, { movieId: 550 });
  const l1 = rows.find((r) => r.listId === L1.id)!;
  const l2 = rows.find((r) => r.listId === L2.id)!;
  expect(l1.contains).toBe(true);
  expect(typeof l1.itemId).toBe("number");
  expect(l2.contains).toBe(false);
  expect(l2.itemId).toBeNull();
  expect(rows.some((r) => r.kind === "FOUR_FAVORITES")).toBe(false);
});
```

- [ ] **Step 2: Run, verify FAIL.**

- [ ] **Step 3: Implement query** in `lists.ts`:

```typescript
export interface ListMembershipRow {
  listId: number;
  name: string;
  kind: ListKind;
  itemCount: number;
  isPublic: boolean;
  contains: boolean;
  itemId: number | null; // ListItem.id when contains, for removal
}

/**
 * The user's REGULAR lists (FOUR_FAVORITES excluded — it has its own editor)
 * annotated with whether `ref` is already on each. One query for lists, one for
 * the matching items. Used only by the save picker (client-hydrated, never SSR).
 */
export async function getItemListMembership(
  ownerId: number,
  ref: ListItemRef
): Promise<ListMembershipRow[]> {
  const lists = await prisma.list.findMany({
    where: { ownerId, kind: "REGULAR" },
    orderBy: [{ isPinned: "desc" }, { updatedAt: "desc" }],
    select: { id: true, name: true, kind: true, itemCount: true, isPublic: true },
  });
  if (lists.length === 0) return [];
  const refWhere = {
    listId: { in: lists.map((l) => l.id) },
    movieId: ref.movieId ?? null,
    seriesId: ref.seriesId ?? null,
    personId: ref.personId ?? null,
  };
  const items = await prisma.listItem.findMany({
    where: refWhere,
    select: { id: true, listId: true },
  });
  const byList = new Map(items.map((i) => [i.listId, i.id]));
  return lists.map((l) => ({
    listId: l.id,
    name: l.name,
    kind: l.kind,
    itemCount: l.itemCount,
    isPublic: l.isPublic,
    contains: byList.has(l.id),
    itemId: byList.get(l.id) ?? null,
  }));
}
```

- [ ] **Step 4: Add the server action** in `actions/lists.ts`:

```typescript
const MembershipSchema = z.object({ item: ItemRefSchema });

export async function getItemListMembership(input: z.infer<typeof MembershipSchema>) {
  try {
    const { item } = MembershipSchema.parse(input);
    const userId = await requirePgUserId();
    const rows = await getItemListMembershipQuery(userId, item);
    return { success: true as const, rows };
  } catch (error: unknown) {
    return actionError("getItemListMembership", error);
  }
}
```

(Import `getItemListMembership as getItemListMembershipQuery` from the db module.)

- [ ] **Step 5: Route `getList` action through the seam** — replace its inline check:

```typescript
export async function getList(input: z.infer<typeof ListIdSchema>) {
  try {
    const { listId } = ListIdSchema.parse(input);
    const userId = await requirePgUserId();
    if (!(await canViewList(listId, userId))) {
      return { success: false as const, error: "Not found" };
    }
    const list = await getListWithItems(listId);
    if (!list) return { success: false as const, error: "Not found" };
    return { success: true as const, list };
  } catch (error: unknown) {
    return actionError("getList", error);
  }
}
```

- [ ] **Step 6: Run tests, verify PASS.** `git commit -m "feat(lists): getItemListMembership action + getList via access seam"`.

---

## Task 3: Audit-harden list mutations (`auditedTransaction`)

Social invariant #5: `lists` is an audited table; mutations must run through `auditedTransaction(actorId, fn)` so `audit_log.actor_id` is set. Today they use plain `prisma.$transaction` → NULL actor. Fix it.

**Files:**
- Modify: `src/server/db/postgres/social/lists.ts`
- Test: `src/server/db/postgres/social/lists.test.ts`

- [ ] **Step 1: Failing test** — assert the actor is captured on an add:

```typescript
it("addListItem records the actor in audit_log", async () => {
  const item = await addListItem(OWNER, L2.id, { movieId: 278 });
  const row = await prisma.$queryRaw<{ actor_id: number }[]>`
    SELECT actor_id FROM audit_log
    WHERE table_name='lists' AND operation IN ('I','U')
    ORDER BY changed_at DESC LIMIT 1`;
  expect(row[0]?.actor_id).toBe(OWNER); // itemCount UPDATE on lists carries the actor
});
```

(Audit fires on `lists`/`list_items` per `05-audit.sql`; the `itemCount` increment is the audited `lists` UPDATE.)

- [ ] **Step 2: Run, verify FAIL** (actor is NULL today).

- [ ] **Step 3: Swap `prisma.$transaction` → `auditedTransaction`** in `addListItem`, `removeListItem`, `moveListItem`, and wrap the single-statement `createList`/`updateList`/`deleteList`/`setFourFavorites` writes. Pattern:

```typescript
import { auditedTransaction } from "@/server/db/audit";

// addListItem body, after requireOwnedList(...) guard:
return auditedTransaction(ownerId, async (tx) => {
  const last = await tx.listItem.findFirst({ where: { listId }, orderBy: { position: "desc" }, select: { position: true } });
  try {
    const item = await tx.listItem.create({ data: { /* unchanged */ } });
    await tx.list.update({ where: { id: listId }, data: { itemCount: { increment: 1 } } });
    return item;
  } catch (error: unknown) {
    if (isPrismaError(error) && error.code === "P2002") throw new Error("Item already on this list");
    throw error;
  }
});
```

Apply the same `auditedTransaction(ownerId, async (tx) => {...})` swap everywhere `prisma.$transaction` appears in this file, and convert the bare `prisma.list.create/update/delete` calls in createList/updateList/deleteList to run inside `auditedTransaction(ownerId, tx => tx.list...)`.

- [ ] **Step 4: Run the FULL lists test file, verify PASS** (and that ownership guards still throw for strangers).

- [ ] **Step 5: Commit** — `git commit -m "fix(lists): route list mutations through auditedTransaction (social invariant #5)"`.

---

## Task 4: Regression-lock watchlist auto-remove on watched

No new behavior — capture the EXISTING behavior so a future refactor can't silently break it.

**Files:**
- Test: `src/server/db/postgres/social/watch-events-watchlist.test.ts`

- [ ] **Step 1: Write test:**

```typescript
import { describe, it, expect } from "vitest";
import { prisma } from "@/server/db/postgres/client";
import { logWatchEvent } from "./watch-events";

describe("watchlist auto-removal on watch (Trakt/Letterboxd model)", () => {
  it("WATCH on a movie removes it from the watchlist", async () => {
    await prisma.watchlistItem.create({ data: { userId: U, movieId: 603 } });
    await logWatchEvent(U, { movieId: 603, kind: "WATCH" });
    const still = await prisma.watchlistItem.findFirst({ where: { userId: U, movieId: 603 } });
    expect(still).toBeNull();
  });
  it("a NOTE (not a viewing) does NOT remove it from the watchlist", async () => {
    await prisma.watchlistItem.create({ data: { userId: U, movieId: 604 } });
    await logWatchEvent(U, { movieId: 604, kind: "NOTE" });
    const still = await prisma.watchlistItem.findFirst({ where: { userId: U, movieId: 604 } });
    expect(still).not.toBeNull();
  });
});
```

- [ ] **Step 2: Run, verify PASS immediately** (behavior already exists). If it FAILS, the behavior regressed — stop and investigate before continuing.

- [ ] **Step 3: Commit** — `git commit -m "test(lists): lock watchlist auto-remove-on-watch behavior"`.

---

## Task 5: `useMyLists` + `useListMembership` hooks

Client glue. The picker fetches lazily on open (no global store changes); membership is per-item.

**Files:**
- Create: `src/hooks/use-my-lists.ts`
- Create: `src/hooks/use-list-membership.ts`

- [ ] **Step 1:** `use-list-membership.ts` — fetch membership on demand, optimistic toggle:

```typescript
"use client";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import {
  getItemListMembership,
  addListItem,
  removeListItem,
} from "@/server/actions/lists";
import type { MediaType } from "@/stores/user";

export interface MembershipRow {
  listId: number;
  name: string;
  itemCount: number;
  isPublic: boolean;
  contains: boolean;
  itemId: number | null;
  pending?: boolean;
}

function toRef(itemId: number, mediaType: MediaType) {
  return mediaType === "movie" ? { movieId: itemId } : { seriesId: itemId };
}

export function useListMembership(itemId: number, mediaType: MediaType, open: boolean) {
  const [rows, setRows] = useState<MembershipRow[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    getItemListMembership({ item: toRef(itemId, mediaType) })
      .then((res) => {
        if (cancelled) return;
        if (res.success) setRows(res.rows.map((r) => ({ ...r, pending: false })));
      })
      .finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, [open, itemId, mediaType]);

  const toggle = useCallback(
    async (listId: number) => {
      const row = rows.find((r) => r.listId === listId);
      if (!row || row.pending) return;
      const wasIn = row.contains;
      // optimistic
      setRows((prev) =>
        prev.map((r) =>
          r.listId === listId ? { ...r, contains: !wasIn, pending: true } : r
        )
      );
      try {
        if (wasIn && row.itemId != null) {
          const res = await removeListItem({ listId, itemId: row.itemId });
          if (!res.success) throw new Error(res.error);
          setRows((prev) => prev.map((r) => (r.listId === listId ? { ...r, itemId: null, pending: false, itemCount: Math.max(0, r.itemCount - 1) } : r)));
        } else {
          const res = await addListItem({ listId, item: toRef(itemId, mediaType) });
          if (!res.success) throw new Error(res.error);
          setRows((prev) => prev.map((r) => (r.listId === listId ? { ...r, itemId: res.itemId, pending: false, itemCount: r.itemCount + 1 } : r)));
        }
      } catch (e: unknown) {
        // revert
        setRows((prev) => prev.map((r) => (r.listId === listId ? { ...r, contains: wasIn, pending: false } : r)));
        toast.error("Couldn't update list", { description: e instanceof Error ? e.message : undefined });
      }
    },
    [rows, itemId, mediaType]
  );

  // appendList: called after inline create so the new list shows up checked
  const appendList = useCallback((row: MembershipRow) => setRows((prev) => [row, ...prev]), []);

  return { rows, loading, toggle, appendList, hasLists: rows.length > 0 };
}
```

- [ ] **Step 2:** `use-my-lists.ts` — wraps `createList` + `addListItem` for the inline "create new list" flow, returning the new membership row:

```typescript
"use client";
import { useCallback } from "react";
import { createList, addListItem } from "@/server/actions/lists";
import type { MediaType } from "@/stores/user";
import type { MembershipRow } from "./use-list-membership";

export function useCreateListWithItem() {
  return useCallback(
    async (name: string, itemId: number, mediaType: MediaType): Promise<MembershipRow | null> => {
      const created = await createList({ name });
      if (!created.success || !created.list) return null;
      const ref = mediaType === "movie" ? { movieId: itemId } : { seriesId: itemId };
      const added = await addListItem({ listId: created.list.id, item: ref });
      return {
        listId: created.list.id,
        name: created.list.name,
        itemCount: added.success ? 1 : 0,
        isPublic: created.list.isPublic,
        contains: added.success,
        itemId: added.success ? added.itemId ?? null : null,
        pending: false,
      };
    },
    []
  );
}
```

- [ ] **Step 3:** `yarn typecheck` (exit 0). Commit — `git commit -m "feat(lists): client hooks for membership + inline create"`.

---

## Task 6: `SaveToListSheet` (responsive picker) — frontend-design skill

**INVOKE `frontend-design` skill before this task.** Mobile-first 390px. DESIGN.md is law.

**Files:**
- Create: `src/components/features/lists/save-to-list-sheet.tsx`
- Create: `src/components/features/lists/create-list-dialog.tsx` (or an inline-create row inside the sheet — see steps)

**Requirements (build to these exactly):**
- Responsive: `useMobile()` → mobile = Vaul `Drawer` (`direction="bottom"`), desktop = `Popover` anchored to the caret. NEVER a Radix Sheet for the mobile bottom surface (DESIGN.md mandate).
- Mobile overlay MUST wire `useHistoryDismiss(open, onClose)` (back button closes, doesn't navigate) — DESIGN.md + pwa-mobile.md.
- Header: small poster + title of the item for context (passed as props).
- Row order: **Watchlist row FIRST** (privileged; reads/writes the Zustand `toggleWatchlist`, shows `isInWatchlist`), then a divider, then `+ Create new list` row, then custom list rows from `useListMembership`.
- Each row ≥ 48px, **whole row tappable** (not just the checkbox), `Checkbox` reflects `contains`, `pending` → 50% opacity + tiny `Loader2` spinner (per GitLab Pajamas + media-actions precedent). Public lists show a small globe hint.
- Empty custom-lists state: a friendly "Create your first list" prompt above the create row (the adaptive behavior — caret still works).
- Search `Input` appears only when `rows.length > 15`; filters by name client-side.
- No "Done" button. Closing (scrim tap / drag / back / X) just dismisses; every toggle already committed.
- `safe-area-inset-bottom` on the drawer footer/content (Drawer content already bottom-pinned; add `pb-[env(safe-area-inset-bottom)]`).
- Hardcoded colors only over imagery — this sheet renders on `bg-background`, so use semantic tokens (`text-foreground`, `text-muted-foreground`, `border-border`, `bg-muted`).

- [ ] **Step 1:** Build the inline create-row: a row that expands into an `Input` + confirm; on submit calls `useCreateListWithItem()`, then `appendList(row)` and collapses. Optimistic: show the new row checked immediately.
- [ ] **Step 2:** Build the list body (Watchlist row + custom rows) per requirements. Accept props:

```typescript
interface SaveToListSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  itemId: number;
  mediaType: MediaType;
  title: string;
  posterPath?: string | null;
  isInWatchlist: boolean;
  onToggleWatchlist: () => Promise<void> | void;
}
```

- [ ] **Step 3:** Wire `useMobile()` branch (Drawer vs Popover) sharing ONE inner `<SaveToListBody/>`.
- [ ] **Step 4:** `yarn typecheck` + `yarn lint`. Commit — `git commit -m "feat(lists): SaveToListSheet responsive picker"`.
- [ ] **Step 5 (deferred to Task 11):** browser-verify at 390×844 + 1440×900.

---

## Task 7: `SaveButton` split control + integrate

**Files:**
- Create: `src/components/features/lists/save-button.tsx`
- Modify: `src/components/features/media/media-actions.tsx`
- Modify: `src/components/features/movie/movie-card-actions.tsx`

**Requirements:**
- `SaveButton` owns the picker `open` state + renders `SaveToListSheet`.
- Three visual variants matching the host sites: `"hero"` (pill, label "Watchlist"/"Listed" + caret), `"compact"` (icon pill + tiny caret), `"card"` (icon button + caret on overlay).
- Primary region = existing watchlist toggle behavior (keep the Framer animations from `media-actions.tsx` for the hero/compact paths — pass them through or keep them in `media-actions` and only graft the caret). Caret region = a separate ≥44px tap target opening the picker; `aria-haspopup`, `aria-label="Save to list"`.
- Preserve existing analytics calls (`trackWatchlistAdd/Remove`).

- [ ] **Step 1:** Build `SaveButton` with the three variants. Caret is a sibling button (split button), always visible.
- [ ] **Step 2:** In `media-actions.tsx`, replace the Watchlist `<Button>` (both `compact` early-return and `hero`) with `SaveButton`, threading `isInWatchlist`, `toggleWatchlist` (from `useUserLibrary`), `itemId`, `mediaType`, `title`, `posterPath` (add a `posterPath?` prop to `MediaActionsProps`; pass from `MediaActionBar` callers). Keep `watchedSlot` and the like/dislike/share cluster untouched.
- [ ] **Step 3:** In `movie-card-actions.tsx`, replace the watchlist `<Button>` with `SaveButton variant="card"`. The card has no poster handy → pass `posterPath` if the card already has it, else `null` (header just shows title).
- [ ] **Step 4:** `yarn typecheck` + `yarn lint`. Commit — `git commit -m "feat(lists): SaveButton split control wired into media + card action bars"`.

---

## Task 8: `/lists` — my-lists browse page

**Files:**
- Create: `src/app/lists/page.tsx` (dynamic, auth-gated — like `/diary`)
- Create: `src/components/features/lists/lists-client.tsx`
- Create: `src/components/features/lists/list-card.tsx`
- Create: `src/components/features/lists/list-poster-stack.tsx`

- [ ] **Step 1:** `list-poster-stack.tsx` — overlaid posters cover (extract the `flex -space-x-3` pattern from `showcase.lists` render.tsx into a shared component; props `{ posterPaths: string[] }`, uses `TMDB_IMAGE_BASE/w92`).
- [ ] **Step 2:** `list-card.tsx` — a tile: poster stack + name + `{itemCount} titles` + public/private hint; links to `/lists/[id]` for owner OR (if we route owner view through the public slug) to `/u/[me]/list/[slug]`. **Decision:** owner browse links to the public slug route `/u/[username]/list/[slug]` (Task 9), which renders an owner-edit island when the viewer is the owner — one detail page, two modes. So `list-card` needs the owner's username (pass from page) + slug.
- [ ] **Step 3:** `lists-client.tsx` — `"use client"`; on mount calls `getMyLists()`; renders a responsive grid (`PageMain` shell) of `ListCard` + a prominent "New list" `CreateListDialog` trigger; empty state.
- [ ] **Step 4:** `app/lists/page.tsx`:

```tsx
import { PageMain } from "@/components/features/layout/page-main";
import { ListsClient } from "@/components/features/lists/lists-client";

export const metadata = { title: "My Lists" };

export default function ListsPage() {
  return (
    <PageMain>
      <ListsClient />
    </PageMain>
  );
}
```

(Auth gating: `ListsClient` shows a sign-in prompt when `getMyLists()` returns `success:false`; do NOT call `auth()` in the page — keep it a client island like `/watchlist`.)

- [ ] **Step 5:** `create-list-dialog.tsx` — responsive (Drawer mobile / Dialog desktop) form: name (required), description, public toggle, ranked toggle → `createList`. On success, route to the new list or refresh `getMyLists`.
- [ ] **Step 6:** `yarn typecheck` + `yarn lint`. Commit — `git commit -m "feat(lists): /lists browse page + list card/cover/create-dialog"`.

---

## Task 9: `/u/[username]/list/[slug]` — public list detail (ISR) + owner edit

The page the `showcase.lists` widget already links to (currently 404s). **EDGE-CACHE INVARIANT:** ISR-cacheable, NO viewer data in the cached HTML; owner-edit island hydrates client-side.

**Files:**
- Create: `src/server/db/postgres/social/public-list.ts`
- Create: `src/app/u/[username]/list/[slug]/page.tsx`
- Create: `src/components/features/lists/list-detail-client.tsx`

- [ ] **Step 1:** `public-list.ts` — `getPublicListBySlug(username, slug)`: resolve user by `lower(username)`, find the list by `(ownerId, slug)`, return it with items (reuse `getListWithItems` shape) **only if `isPublic`** (the cached render must not leak private lists). Returns `null` otherwise. NO `auth()`/`headers()`.

```typescript
export async function getPublicListBySlug(username: string, slug: string) {
  const user = await prisma.user.findFirst({
    where: { username: { equals: username, mode: "insensitive" } },
    select: { id: true, username: true, name: true, image: true },
  });
  if (!user) return null;
  const list = await prisma.list.findFirst({
    where: { ownerId: user.id, slug, isPublic: true },
    include: { items: { orderBy: { position: "asc" }, include: {
      movie: { select: { id: true, title: true, posterPath: true } },
      series: { select: { id: true, name: true, posterPath: true } },
      person: { select: { id: true, name: true, profilePath: true } },
    } } },
  });
  if (!list) return null;
  return { owner: user, list };
}
```

- [ ] **Step 2:** `page.tsx` — ISR, mirroring `/u/[username]` invariants:

```tsx
export const revalidate = 300;
export function generateStaticParams() { return []; }   // REQUIRED or revalidate is a no-op

export async function generateMetadata({ params }): Promise<Metadata> { /* title = list.name, OG */ }

export default async function ListDetailPage({ params }) {
  const { username, slug } = await params;
  const data = await getPublicListBySlug(username, slug);
  if (!data) notFound();
  return (
    <PageMain>
      {/* server-rendered: list header (name, owner, count, poster grid of items) — NO viewer data */}
      <ItemList Posters .../>
      {/* client island: hydrates owner controls + own membership; renders nothing for non-owners */}
      <ListDetailClient listId={data.list.id} ownerId={data.owner.id} slug={slug} username={username} />
    </PageMain>
  );
}
```

The poster grid of items is server-rendered (public data). `ItemNotFound`/private → `notFound()`.

- [ ] **Step 3:** `list-detail-client.tsx` — `"use client"`; checks the session; if the viewer is the owner, renders an "Edit" affordance that enables: rename/description/privacy (`updateList`), reorder (`moveListItem` — drag handles), remove item (`removeListItem`). For non-owners renders nothing (or a "Save a copy" later — out of scope). Uses optimistic updates. **No SSR; this island is why the page stays cacheable.**

- [ ] **Step 4:** **Proxy slug-resolver gotcha** — the catch-all `/u/[username]` is NOT a media catch-all, so the `media-resolver.ts` 308-canonicalizer does NOT apply here (that only governs `/movie|/series`). Verify a direct load of `/u/<name>/list/<slug>` resolves (it's a normal nested static route under `/u/[username]`). If `/u/[username]` is itself a catch-all (`[...]`), fold this in like the discuss pages — CHECK first (read `src/app/u/[username]/` dir structure).

- [ ] **Step 5:** `yarn typecheck` + `yarn lint`. Commit — `git commit -m "feat(lists): public list detail page (ISR) + owner edit island"`.

---

## Task 10: Nav wiring + profile widget link sanity

**Files:**
- Modify nav components (mirror Diary/Stats from phase-0 UI T16): mobile bottom nav overflow + desktop user menu.
- Verify `showcase.lists` widget href now resolves.

- [ ] **Step 1:** Add a "Lists" entry to the user menu (desktop) and the mobile nav/overflow, linking to `/lists`. Find the nav file the same way Diary/Stats were added (search for `"/diary"` literal).
- [ ] **Step 2:** Confirm `showcase.lists` widget links (`/u/${username}/list/${slug}`) land on the Task 9 page for public lists. No code change expected — just verify.
- [ ] **Step 3:** `yarn typecheck` + `yarn lint`. Commit — `git commit -m "feat(lists): nav entry for /lists"`.

---

## Task 11: Verification (local, mobile + desktop)

**REQUIRED — see superpowers:verification-before-completion.** Static checks are insufficient; render it.

- [ ] **Step 1:** `npx pm2 restart mb-dev` (picks up schema/client if changed); confirm online + tail logs for compile errors: `npx pm2 logs mb-dev --nostream --lines 60`.
- [ ] **Step 2:** Get a test-auth session (local, triple-gated): GET `/api/test-auth/login`. Seed a couple of lists via the UI.
- [ ] **Step 3:** Playwright (from repo root; spoof real Chrome UA + clean `sec-ch-ua` to pass the proxy bot-shed; `serviceWorkers: "block"` for TMDB images — see performance.md). Screenshot at **390×844** and **1440×900**:
  - movie detail hero: SaveButton split + open the picker (Drawer mobile / Popover desktop).
  - card hover/overlay: SaveButton card variant.
  - `/lists` browse (empty + populated).
  - `/u/<name>/list/<slug>` detail (as owner = edit island; as anon = read-only).
  - Toggle a list membership; confirm optimistic check + spinner + persistence on reopen.
- [ ] **Step 4:** **Edge-cache invariant check** — `curl` (UA-spoofed) the list detail page and grep the HTML: it MUST contain the public list items but NO viewer-specific markup (no "Edit", no own-membership state). Owner controls appear only after client hydration.
- [ ] **Step 5:** `DATABASE_URL='...5436' yarn typecheck` (0) + `yarn lint` (0 errors) + `DATABASE_URL='...5436' npx vitest run src/server/db/postgres/social/lists.test.ts src/server/db/postgres/social/watch-events-watchlist.test.ts` (green).
- [ ] **Step 6:** Commit any fixes. Final `git push . HEAD:master` checkpoint (LOCAL only).

---

## Self-Review (run before handing to review agents)

**Spec coverage:** picker (T6/T7), watchlist-as-privileged-row (T6), multi-membership (schema + T2), create-inline (T5/T6), list pages (T8/T9), nav (T10), auto-remove (T4), forward-compat seam (T1/T2/T9). ✓
**Edge-cache:** T9 keeps viewer data out of cached HTML (server renders public items only; owner island client-side); `/lists` is dynamic/client-island. ✓
**Audit:** T3 routes mutations through `auditedTransaction`. ✓
**Natural keys:** lists relate to `movies/series/person` via existing `ListItem` FKs (Restrict) — untouched; no episode FK introduced. ✓
**Type consistency:** `MembershipRow` shape shared by `getItemListMembership` (db) → action → `useListMembership` → sheet; `ListItemRef` reused from `lists.ts`. ✓
**"use server" rule:** new `getItemListMembership` action is async; the membership ROW type lives in `lists.ts` (db module), not exported from the `"use server"` actions file. ✓

## Open risks to flag to review agents

1. **Two-backend optimism** — Watchlist (Zustand) and custom lists (component-local state) are reconciled in the sheet. Watchlist toggle stays in Zustand so it stays consistent with cards/other surfaces; the sheet reads `isInWatchlist` via props from `useUserLibrary`. Confirm no double-source-of-truth drift.
2. **`/u/[username]` route shape** — verify whether it's a static `[username]` segment or a catch-all before adding the nested `list/[slug]` route (T9 Step 4).
3. **`auditedTransaction` signature** — confirm it returns the inner fn's value and accepts a `tx` callback identical to `prisma.$transaction` (T3 assumes this).
4. **Card variant poster** — movie cards may not have `posterPath` in props; picker header degrades to title-only. Acceptable.
