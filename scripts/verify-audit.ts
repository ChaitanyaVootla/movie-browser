/**
 * End-to-end verification of the audit-log backbone against the dev DB.
 * Mirrors the psql verification in the audit spec, using Prisma raw SQL so it
 * runs anywhere (psql not required). Each scenario sets the actor GUC inside a
 * transaction (the trigger reads `audit.actor_id`), mutates, then asserts what
 * landed in audit_log. All test mutations are rolled back or reverted.
 *
 * Usage:
 *   DATABASE_URL="postgresql://dev:dev@localhost:5436/moviebrowser" \
 *     npx tsx scripts/verify-audit.ts
 */
import { PrismaClient, Prisma } from "@prisma/client";

const prisma = new PrismaClient();

type AuditRow = {
  table_name: string;
  operation: string;
  actor_id: number | null;
  changed_columns: string[];
  bio: string | null;
};

let failures = 0;
function check(label: string, cond: boolean, detail: string): void {
  console.log(`${cond ? "PASS" : "FAIL"}  ${label} :: ${detail}`);
  if (!cond) failures++;
}

async function latestFor(table: string): Promise<AuditRow | undefined> {
  const rows = await prisma.$queryRaw<AuditRow[]>(Prisma.sql`
    SELECT table_name, operation, actor_id, changed_columns, new_data->>'bio' AS bio
      FROM audit_log WHERE table_name = ${table} ORDER BY id DESC LIMIT 1`);
  return rows[0];
}

async function main(): Promise<void> {
  const user = await prisma.user.findFirst({ orderBy: { id: "asc" }, select: { id: true, bio: true } });
  if (!user) throw new Error("no users in DB — seed a user first");
  const uid = user.id;
  console.log(`Using user id=${uid}\n`);

  // --- Scenario 1: tracked UPDATE with actor -----------------------------
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('audit.actor_id', ${String(uid)}, true)`;
    await tx.$executeRaw`UPDATE users SET bio = 'audit-test' WHERE id = ${uid}`;
  });
  const r1 = await latestFor("users");
  check(
    "tracked UPDATE writes a row",
    !!r1 && r1.operation === "UPDATE" && r1.actor_id === uid && r1.changed_columns.includes("bio") && r1.bio === "audit-test",
    JSON.stringify(r1)
  );

  // --- Scenario 2: no-op UPDATE (same value) writes NO row ----------------
  const before2 = (await latestFor("users"))?.bio;
  const countBefore2 = await prisma.auditLog.count({ where: { tableName: "users" } });
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('audit.actor_id', ${String(uid)}, true)`;
    await tx.$executeRaw`UPDATE users SET bio = 'audit-test' WHERE id = ${uid}`; // unchanged
  });
  const countAfter2 = await prisma.auditLog.count({ where: { tableName: "users" } });
  check("no-op UPDATE writes NO row", countBefore2 === countAfter2, `count ${countBefore2} -> ${countAfter2} (bio still ${before2})`);

  // --- Scenario 3: excluded-column-only UPDATE writes NO row --------------
  const countBefore3 = await prisma.auditLog.count({ where: { tableName: "users" } });
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('audit.actor_id', ${String(uid)}, true)`;
    await tx.$executeRaw`UPDATE users SET last_active_at = now() WHERE id = ${uid}`;
  });
  const countAfter3 = await prisma.auditLog.count({ where: { tableName: "users" } });
  check("excluded-col-only UPDATE writes NO row", countBefore3 === countAfter3, `count ${countBefore3} -> ${countAfter3}`);

  // --- Scenario 4: actor degrades to NULL when GUC unset ------------------
  await prisma.$executeRaw`UPDATE users SET bio = 'audit-test-2' WHERE id = ${uid}`;
  const r4 = await latestFor("users");
  check("UPDATE without actor GUC -> NULL actor", !!r4 && r4.actor_id === null && r4.bio === "audit-test-2", JSON.stringify(r4));

  // restore bio
  await prisma.$executeRaw`UPDATE users SET bio = ${user.bio} WHERE id = ${uid}`;

  // --- Scenario 5: claimUsername-equivalent writes BOTH history + audit ---
  const u = await prisma.user.findUnique({ where: { id: uid }, select: { username: true } });
  const origUsername = u?.username ?? null;
  const tempUsername = `audit_tmp_${uid}`;
  const histBefore = await prisma.usernameHistory.count({ where: { userId: uid } });
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('audit.actor_id', ${String(uid)}, true)`;
    const cur = await tx.user.findUnique({ where: { id: uid }, select: { username: true } });
    await tx.user.update({ where: { id: uid }, data: { username: tempUsername } });
    if (cur?.username && cur.username !== tempUsername) {
      await tx.usernameHistory.create({ data: { userId: uid, username: cur.username } });
    }
  });
  const histAfter = await prisma.usernameHistory.count({ where: { userId: uid } });
  const rU = await latestFor("users");
  const auditHasUsername = !!rU && rU.operation === "UPDATE" && rU.actor_id === uid && rU.changed_columns.includes("username");
  // history row only expected if there was a prior username to leave behind
  const historyExpected = origUsername && origUsername !== tempUsername ? 1 : 0;
  check(
    "claimUsername path writes audit_log row (username changed, actor set)",
    auditHasUsername,
    JSON.stringify(rU)
  );
  check(
    "claimUsername path writes username_history row when prior handle existed",
    histAfter - histBefore === historyExpected,
    `history ${histBefore} -> ${histAfter} (expected +${historyExpected})`
  );

  // restore username + clean the temp history row
  await prisma.user.update({ where: { id: uid }, data: { username: origUsername } });
  await prisma.usernameHistory.deleteMany({ where: { userId: uid, username: tempUsername } });
  if (origUsername) await prisma.usernameHistory.deleteMany({ where: { userId: uid, username: origUsername } });

  // --- Cleanup: remove the audit rows this script produced ----------------
  await prisma.$executeRaw`DELETE FROM audit_log WHERE table_name = 'users' AND new_data->>'bio' IN ('audit-test','audit-test-2') OR (table_name = 'users' AND new_data->>'username' = ${tempUsername})`;

  console.log(`\n${failures === 0 ? "ALL PASS" : `${failures} FAILURE(S)`}`);
  if (failures > 0) process.exitCode = 1;
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
