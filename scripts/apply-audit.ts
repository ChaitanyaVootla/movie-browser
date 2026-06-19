/**
 * Applies postgres/init/05-audit.sql to the target database (local dev path;
 * the deploy pipeline pipes the same file to psql in a hash-gated step).
 *
 * The audit SQL contains a dollar-quoted plpgsql function body, so it CANNOT be
 * naively split on ';' (the function body has its own statements). Prisma's
 * $executeRawUnsafe uses the extended protocol, which rejects multi-statement
 * batches — so we split into statements while respecting `$$` dollar-quote
 * boundaries, then run each one.
 *
 * Usage:
 *   DATABASE_URL="postgresql://dev:dev@localhost:5436/moviebrowser" \
 *     npx tsx scripts/apply-audit.ts
 */
import { readFileSync } from "fs";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

/** Split SQL on ';' at statement level, treating `$$...$$` regions as opaque. */
function splitStatements(sql: string): string[] {
  // Strip whole-line `--` comments OUTSIDE dollar-quoted bodies first so a
  // stray ';' in prose can't split a statement. (Function bodies have no line
  // comments here, so a simple line-wise strip is safe.)
  const stripped = sql
    .split("\n")
    .map((line) => (line.trim().startsWith("--") ? "" : line))
    .join("\n");
  const statements: string[] = [];
  let buf = "";
  let inDollar = false;
  for (let i = 0; i < stripped.length; i++) {
    const two = stripped.slice(i, i + 2);
    if (two === "$$") {
      inDollar = !inDollar;
      buf += two;
      i++;
      continue;
    }
    const ch = stripped[i];
    if (ch === ";" && !inDollar) {
      const trimmed = buf.trim();
      if (trimmed) statements.push(trimmed);
      buf = "";
    } else {
      buf += ch;
    }
  }
  const tail = buf.trim();
  if (tail) statements.push(tail);
  return statements;
}

async function main(): Promise<void> {
  const sql = readFileSync("postgres/init/05-audit.sql", "utf8");
  for (const statement of splitStatements(sql)) {
    await prisma.$executeRawUnsafe(statement);
  }

  const triggers = await prisma.$queryRawUnsafe<Array<{ tgname: string; relname: string }>>(
    `SELECT t.tgname, c.relname
       FROM pg_trigger t
       JOIN pg_class c ON c.oid = t.tgrelid
      WHERE t.tgname LIKE 'trg_audit_%'
      ORDER BY c.relname`
  );
  console.log(`Applied postgres/init/05-audit.sql`);
  console.log(
    `Audit triggers present: ${triggers.map((t) => `${t.relname}(${t.tgname})`).join(", ")}`
  );
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
