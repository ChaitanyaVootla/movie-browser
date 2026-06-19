/**
 * seed-countries.ts — seed the `countries` reference table with the full
 * ISO 3166-1 alpha-2 list.
 *
 * WHY THIS EXISTS:
 *   `countries(code)` is an FK target for `watch_options.country_code`,
 *   `movie_countries`, `series_countries`, certifications, etc. The hydration
 *   pipeline only LAZILY upserts the origin/production-country codes of titles
 *   it has already ingested (see upsertMovieCountries in
 *   src/server/services/hydration/sources/postgres/movie-upsert.ts), but
 *   `upsertWatchProviders` (shared-upserts.ts) inserts watch_options rows whose
 *   country_code comes from TMDB *watch-provider regions* (US, BR, DE, FR, ...)
 *   WITHOUT first upserting those codes into `countries`. It relies on the table
 *   already containing every ISO code.
 *
 *   On a sparse/fresh dev DB the table is nearly empty, so miss-path hydration
 *   of an uncatalogued title aborts the whole upsert transaction with:
 *     Foreign key constraint violated: `watch_options_country_code_fkey`
 *   → the movie row never persists, every visit is a fresh PG miss, and the
 *   slug resolver falls back to a 2s TMDB existence check (intermittent
 *   /discussions 404s). Seeding the full list once makes inserts succeed.
 *
 * SOURCE: the `country-list` npm package (already a dependency; ISO 3166-1
 *   alpha-2, 249 entries) — the same source the profile country-map widget uses.
 *
 * Idempotent: upsert by code. Safe to re-run. Existing names are refreshed.
 *
 * Usage (LOCAL dev DB only — NEVER the prod-tunnel .env DATABASE_URL):
 *   DATABASE_URL='postgresql://dev:dev@localhost:5436/moviebrowser' \
 *     npx tsx scripts/seed-countries.ts
 */
import { PrismaClient } from "@prisma/client";
import { getData } from "country-list";

const DB_URL = process.env.DATABASE_URL ?? "";
if (!DB_URL.includes("5436")) {
  console.error(
    "REFUSING TO RUN: DATABASE_URL must point at the local dev DB on port 5436.\n" +
      "  Got: " +
      (DB_URL ? DB_URL.replace(/:[^:@/]+@/, ":****@") : "(unset)") +
      "\n  Expected something like postgresql://dev:dev@localhost:5436/moviebrowser",
  );
  process.exit(1);
}

// Codes country-list can miss but TMDB still uses (mirrors prisma/seed.ts —
// the canonical reference-data seed used in prod via `yarn db:seed --ref`).
const ADDITIONAL: Array<{ code: string; name: string }> = [
  { code: "XK", name: "Kosovo" },
  { code: "TW", name: "Taiwan" },
  { code: "SU", name: "Soviet Union" }, // obsolete but TMDB uses it for old certs
];

async function main(): Promise<void> {
  const prisma = new PrismaClient();
  try {
    const base = getData(); // Array<{ code: string; name: string }>
    const rows = [
      ...base,
      ...ADDITIONAL.filter((a) => !base.some((c) => c.code === a.code)),
    ];
    let written = 0;
    for (const { code, name } of rows) {
      await prisma.country.upsert({
        where: { code },
        create: { code, name },
        update: { name },
      });
      written += 1;
    }
    const total = await prisma.country.count();
    console.log(
      `[seed-countries] upserted ${written} ISO 3166-1 codes; countries table now has ${total} rows.`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error("[seed-countries] failed:", message);
  process.exit(1);
});
