/**
 * Live-DB integration test: list mutations must attribute the audit actor.
 *
 * Requires a live Postgres with the audit triggers applied (dev DB on :5436, or
 * any DB where scripts/apply-audit.ts has run). It self-SKIPS when no
 * DATABASE_URL is reachable or the trg_audit_lists trigger is absent, so CI
 * (no seeded DB) stays green. Seeds its OWN FK targets (a user + the movie rows
 * it references) idempotently — does NOT assume any seed movie exists.
 *
 *   DATABASE_URL=postgresql://dev:dev@localhost:5436/moviebrowser \
 *     npx vitest run src/server/db/postgres/social/lists.audit.test.ts
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PrismaClient, Prisma } from "@prisma/client";
import { createList, addListItem, removeListItem, deleteList } from "./lists";

const prisma = new PrismaClient();

const ACTOR_GOOGLE = "audit-lists-vitest-actor";
const TEST_MOVIE_ID = 999000901; // synthetic, won't collide with seed/TMDB ids

let dbReady = false;
let actorId = 0;
const createdListIds: number[] = [];

beforeAll(async () => {
  try {
    const triggers = await prisma.$queryRaw<Array<{ tgname: string }>>(Prisma.sql`
      SELECT tgname FROM pg_trigger WHERE tgname = 'trg_audit_lists'`);
    if (triggers.length !== 1) {
      dbReady = false;
      return;
    }
    // Seed our own FK targets idempotently.
    const user = await prisma.user.upsert({
      where: { googleId: ACTOR_GOOGLE },
      update: {},
      create: { googleId: ACTOR_GOOGLE, email: `${ACTOR_GOOGLE}@example.test`, name: "Audit Actor" },
      select: { id: true },
    });
    actorId = user.id;
    await prisma.movie.upsert({
      where: { id: TEST_MOVIE_ID },
      update: {},
      create: { id: TEST_MOVIE_ID, title: "Audit Test Movie" },
    });
    dbReady = true;
  } catch {
    dbReady = false;
  }
});

afterAll(async () => {
  if (dbReady) {
    for (const id of createdListIds) {
      await prisma.listItem.deleteMany({ where: { listId: id } });
      await prisma.list.deleteMany({ where: { id } });
    }
    await prisma.$executeRaw`DELETE FROM audit_log WHERE table_name IN ('lists','list_items') AND actor_id = ${actorId}`;
    await prisma.movie.deleteMany({ where: { id: TEST_MOVIE_ID } });
    await prisma.user.deleteMany({ where: { googleId: ACTOR_GOOGLE } });
  }
  await prisma.$disconnect();
});

async function latestListsActor(): Promise<number | null | undefined> {
  const rows = await prisma.$queryRaw<{ actor_id: number | null }[]>(Prisma.sql`
    SELECT actor_id FROM audit_log
     WHERE table_name = 'lists' AND operation IN ('INSERT','UPDATE')
     ORDER BY id DESC LIMIT 1`);
  return rows[0]?.actor_id;
}

async function latestListItemsActor(): Promise<number | null | undefined> {
  const rows = await prisma.$queryRaw<{ actor_id: number | null }[]>(Prisma.sql`
    SELECT actor_id FROM audit_log
     WHERE table_name = 'list_items'
     ORDER BY id DESC LIMIT 1`);
  return rows[0]?.actor_id;
}

describe("list mutations record the audit actor (social invariant #5)", () => {
  it("createList attributes the actor on the lists INSERT", async () => {
    if (!dbReady) return;
    const list = await createList(actorId, { name: `Audit List ${Date.now()}` });
    createdListIds.push(list.id);
    expect(await latestListsActor()).toBe(actorId);
  });

  it("addListItem attributes the actor on the lists UPDATE (itemCount) + list_items INSERT", async () => {
    if (!dbReady) return;
    const list = await createList(actorId, { name: `Audit Add ${Date.now()}` });
    createdListIds.push(list.id);
    const item = await addListItem(actorId, list.id, { movieId: TEST_MOVIE_ID });
    // The itemCount increment is the audited lists UPDATE; it must carry the actor.
    expect(await latestListsActor()).toBe(actorId);
    // The list_items INSERT must also carry the actor (C1: list_items is audited).
    expect(await latestListItemsActor()).toBe(actorId);

    // And removal stays attributed.
    await removeListItem(actorId, list.id, item.id);
    expect(await latestListItemsActor()).toBe(actorId);
  });

  it("deleteList attributes the actor on the lists DELETE", async () => {
    if (!dbReady) return;
    const list = await createList(actorId, { name: `Audit Del ${Date.now()}` });
    const ok = await deleteList(actorId, list.id);
    expect(ok).toBe(true);
    const rows = await prisma.$queryRaw<{ actor_id: number | null }[]>(Prisma.sql`
      SELECT actor_id FROM audit_log
       WHERE table_name = 'lists' AND operation = 'DELETE'
       ORDER BY id DESC LIMIT 1`);
    expect(rows[0]?.actor_id).toBe(actorId);
  });
});
