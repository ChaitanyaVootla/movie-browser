/**
 * Applies postgres/init/04-ugc-constraints.sql statement-by-statement via
 * Prisma (local dev path; the deploy pipeline uses psql in a hash-gated step).
 *
 * Usage:
 *   DATABASE_URL="postgresql://dev:dev@localhost:5436/moviebrowser" \
 *     npx tsx scripts/apply-ugc-constraints.ts
 */
import { readFileSync } from "fs";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main(): Promise<void> {
  const sql = readFileSync("postgres/init/04-ugc-constraints.sql", "utf8");
  const statements = sql
    .replace(/^\s*--.*$/gm, "") // strip comment lines
    .split(";")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  for (const statement of statements) {
    await prisma.$executeRawUnsafe(statement);
  }
  console.log(`Applied ${statements.length} statements from 04-ugc-constraints.sql`);

  const checks = await prisma.$queryRawUnsafe<Array<{ conname: string }>>(
    "SELECT conname FROM pg_constraint WHERE conname LIKE 'chk_%' ORDER BY conname"
  );
  const uniques = await prisma.$queryRawUnsafe<Array<{ indexname: string }>>(
    "SELECT indexname FROM pg_indexes WHERE indexname LIKE 'uq_%' ORDER BY indexname"
  );
  console.log(`CHECK constraints present: ${checks.map((c) => c.conname).join(", ")}`);
  console.log(`Unique indexes present: ${uniques.map((u) => u.indexname).join(", ")}`);
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
