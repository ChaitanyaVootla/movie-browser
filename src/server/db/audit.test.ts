/**
 * Integration coverage for the trigger-based audit-log backbone.
 *
 * Requires a live Postgres with the audit triggers applied (the dev DB on
 * :5436, or any DB where scripts/apply-audit.ts has run). It self-SKIPS when no
 * DATABASE_URL is reachable or the trigger is absent, so CI (which has no
 * seeded DB) stays green. Run locally with:
 *   DATABASE_URL=postgresql://dev:dev@localhost:5436/moviebrowser \
 *     yarn test:unit src/server/db/audit.test.ts
 *
 * Covers: trigger fire on UPDATE, changed_columns diff, actor capture via
 * auditedTransaction, no-op-UPDATE skip, and excluded-column-only skip.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PrismaClient, Prisma } from "@prisma/client";
import { auditedTransaction } from "./audit";

const prisma = new PrismaClient();

type AuditRow = {
  operation: string;
  actor_id: number | null;
  changed_columns: string[];
  bio: string | null;
};

let dbReady = false;
let uid = 0;
let originalBio: string | null = null;

async function latestUsersRow(): Promise<AuditRow | undefined> {
  const rows = await prisma.$queryRaw<AuditRow[]>(Prisma.sql`
    SELECT operation, actor_id, changed_columns, new_data->>'bio' AS bio
      FROM audit_log WHERE table_name = 'users' ORDER BY id DESC LIMIT 1`);
  return rows[0];
}

async function usersAuditCount(): Promise<number> {
  return prisma.auditLog.count({ where: { tableName: "users" } });
}

beforeAll(async () => {
  try {
    const triggers = await prisma.$queryRaw<Array<{ tgname: string }>>(Prisma.sql`
      SELECT tgname FROM pg_trigger WHERE tgname = 'trg_audit_users'`);
    const user = await prisma.user.findFirst({ orderBy: { id: "asc" }, select: { id: true, bio: true } });
    if (triggers.length === 1 && user) {
      dbReady = true;
      uid = user.id;
      originalBio = user.bio;
    }
  } catch {
    dbReady = false;
  }
});

afterAll(async () => {
  if (dbReady) {
    await prisma.$executeRaw`UPDATE users SET bio = ${originalBio} WHERE id = ${uid}`;
    await prisma.$executeRaw`DELETE FROM audit_log WHERE table_name = 'users' AND new_data->>'bio' = 'audit-vitest'`;
  }
  await prisma.$disconnect();
});

describe("audit_log trigger backbone", () => {
  it("records a tracked UPDATE with actor + changed_columns", async () => {
    if (!dbReady) return; // self-skip without a live audited DB
    await auditedTransaction(uid, async (tx) => {
      await tx.$executeRaw`UPDATE users SET bio = 'audit-vitest' WHERE id = ${uid}`;
    });
    const row = await latestUsersRow();
    expect(row?.operation).toBe("UPDATE");
    expect(row?.actor_id).toBe(uid);
    expect(row?.changed_columns).toContain("bio");
    expect(row?.bio).toBe("audit-vitest");
  });

  it("writes NO row for a no-op UPDATE (unchanged value)", async () => {
    if (!dbReady) return;
    const before = await usersAuditCount();
    await auditedTransaction(uid, async (tx) => {
      await tx.$executeRaw`UPDATE users SET bio = 'audit-vitest' WHERE id = ${uid}`;
    });
    expect(await usersAuditCount()).toBe(before);
  });

  it("writes NO row when only excluded columns change", async () => {
    if (!dbReady) return;
    const before = await usersAuditCount();
    await auditedTransaction(uid, async (tx) => {
      await tx.$executeRaw`UPDATE users SET last_active_at = now() WHERE id = ${uid}`;
    });
    expect(await usersAuditCount()).toBe(before);
  });

  it("degrades to NULL actor when no audit actor is set", async () => {
    if (!dbReady) return;
    await prisma.$executeRaw`UPDATE users SET bio = 'audit-vitest' || '' WHERE id = ${uid}`;
    // force a real change so a row is written
    await prisma.$executeRaw`UPDATE users SET bio = 'audit-vitest' WHERE id = ${uid}`;
    await prisma.$executeRaw`UPDATE users SET bio = 'audit-vitest-noactor' WHERE id = ${uid}`;
    const row = await latestUsersRow();
    expect(row?.actor_id).toBeNull();
    // clean this extra value
    await prisma.$executeRaw`DELETE FROM audit_log WHERE table_name='users' AND new_data->>'bio'='audit-vitest-noactor'`;
  });
});
