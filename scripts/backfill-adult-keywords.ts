#!/usr/bin/env npx tsx
/**
 * Flag movies/series that are unmistakably pornographic by TMDB KEYWORD but
 * that TMDB's own `adult` boolean says are not.
 *
 * WHY THIS EXISTS. The Jul 2026 purge de-listed everything TMDB flags
 * `adult` (~122k rows), and that flag is what drives noindex + the sitemap
 * gate + every `notAdult()` link filter + the `.md` 404s. But TMDB's flag is
 * incomplete: it marks hardcore/"XXX" catalogue entries and misses the
 * softcore/erotica long tail. Measured Aug 2 2026 in Search Console, the
 * titles Google was actually ranking us for were mostly the MISSED ones —
 * `New Female Secretary` (popularity 7.5), `Leggings Mania`, `Madame Aema`,
 * `Kissing My Sister` — all `adult = false`, all serving `index, follow`,
 * against queries like "sex racecourse" and "american milf movie". That is the
 * exact whole-domain-classified-adult risk the purge existed to remove, so the
 * flag needs topping up from a second signal.
 *
 * KEYWORD CHOICE IS THE WHOLE DESIGN — the set below is deliberately TINY and
 * every candidate was sampled before inclusion. Adult-ADJACENT keywords are
 * dominated by mainstream cinema and would be destructive:
 *
 *   REJECTED (verified false positives, do NOT add):
 *     prostitution / prostitute (1,412)  -> Taxi Driver, Poor Things
 *     sex comedy (463)                   -> American Pie
 *     bdsm (244)                         -> Fifty Shades, The Story of O
 *     erotic thriller (174)              -> Basic Instinct, Unfaithful,
 *                                           The Handmaiden, Babygirl
 *     incest (404), nudity (199)         -> broad mainstream drama
 *     sexploitation (292)                -> The Human Centipede 2 (horror)
 *     erotic movie (1,086)               -> Room in Rome, Below Her Mouth,
 *                                           The Story of O (arthouse)
 *     pornography / porn industry (274)   -> documentaries ABOUT the industry
 *     hardcore (7)                       -> hardcore PUNK MUSIC docs:
 *                                           "Downeast Hardcore", "TERROR -
 *                                           Keepers of the Faith", gabber
 *                                           fanzines. 5-6 of 7 are FPs.
 *
 *   ACCEPTED: `softcore` (4,583 movies / 15 series) — sampled at the top of
 *   the popularity range AND at offset 40+, uniformly Korean/Japanese/Filipino
 *   softcore and hentai (top series is `Overflow`, popularity 127); zero
 *   mainstream titles found. `porn parody` (7) — literally porn (Flesh Gordon
 *   and friends).
 *
 * Certifications were also rejected as a signal: `18+` (4,411) and `R18+`
 * (2,891) are routinely applied to violent mainstream films, and even `NC-17`
 * (524) covers Requiem for a Dream / Shame. A cast-transitive signal (share of
 * `persons.adult` in the credits) was measured and is WEAK — most of the
 * leaking titles have zero adult-flagged cast.
 *
 * EFFECT. Setting `adult = true` needs no other code change: noindex, the
 * sitemap gate, `notAdult()` and the `.md` 404s all read this column. Pages
 * keep WORKING for direct visitors — they only leave search indexes. It
 * propagates on its own (ISR revalidate ~1h, CDN ~2h, sitemap on the nightly
 * cron), so no invalidation is required.
 *
 * Idempotent (`WHERE adult = false` no-ops settled rows) and reversible — the
 * affected ids are exactly the keyword join, so `--revert` undoes it.
 *
 * Usage:
 *   npx tsx scripts/backfill-adult-keywords.ts              # DRY RUN (default)
 *   npx tsx scripts/backfill-adult-keywords.ts --apply
 *   npx tsx scripts/backfill-adult-keywords.ts --revert --apply
 */

import { config } from "dotenv";
config({ path: ".env.local" });
import { prisma } from "../src/server/db/postgres";

/**
 * Reviewed, high-precision only. Read the REJECTED list in the header before
 * adding anything here, and sample the candidate across the popularity range
 * (not just the top) first — `hardcore` looked obvious and was music docs.
 */
const ADULT_KEYWORDS = ["softcore", "porn parody"] as const;

/**
 * COMMERCIAL-FOOTPRINT GUARD. Even `softcore` is not perfectly precise: the
 * keyword is attached to a handful of real theatrical films. A TMDB-reported
 * revenue or budget is the cheapest discriminator, because pornographic
 * catalogue entries essentially never carry one while a theatrical release does.
 *
 * Measured Aug 2 2026: of 4,589 candidates, exactly **14** report >$1M of
 * either — and those 14 are precisely the cases we must not de-index:
 * `Striptease` (1996, $113M, mainstream Demi Moore film — an outright false
 * positive), `Nymphomaniac: Vol. I` and `Vol. II` (von Trier), `Vixen!` /
 * `Supervixens` (Russ Meyer), `All Ladies Do It` (Tinto Brass), the 1974 and
 * 2024 `Emmanuelle`. Skipping them costs ~0.3% of coverage and removes the
 * entire class of embarrassing mistake, so it is on by default.
 *
 * Anything excluded here is REPORTED, never silently dropped.
 */
const COMMERCIAL_FOOTPRINT_MIN = 1_000_000;

const apply = process.argv.includes("--apply");
const revert = process.argv.includes("--revert");
/** Escape hatch to flag the commercially-notable ones too. Requires a human. */
const includeCommercial = process.argv.includes("--include-commercial");
const SAMPLE_SIZE = 25;

interface Row {
  id: number;
  title: string;
  popularity: number;
  revenue: number | null;
  budget: number | null;
}

/** True when the title has a real commercial footprint (see the guard above). */
function isCommercial(r: Row): boolean {
  return (
    Number(r.revenue ?? 0) > COMMERCIAL_FOOTPRINT_MIN ||
    Number(r.budget ?? 0) > COMMERCIAL_FOOTPRINT_MIN
  );
}

async function candidates(kind: "movie" | "series", target: boolean): Promise<Row[]> {
  const [table, join, fk, titleCol] =
    kind === "movie"
      ? ["movies", "movie_keywords", "movie_id", "title"]
      : ["series", "series_keywords", "series_id", "name"];

  // `series` has no revenue/budget columns — select literal NULLs so the row
  // shape (and the guard) stay uniform across both kinds.
  const money =
    kind === "movie" ? "t.revenue, t.budget" : "NULL::bigint AS revenue, NULL::bigint AS budget";

  // Keyword names are a compile-time constant, but bind them anyway rather than
  // interpolating — this file must not become a copy-paste source for
  // string-built SQL. `adult = $2` selects the rows that still need changing,
  // which is what makes the script idempotent.
  return prisma.$queryRawUnsafe<Row[]>(
    `SELECT DISTINCT t.id, t.${titleCol} AS title, t.popularity, ${money}
       FROM ${table} t
       JOIN ${join} j ON j.${fk} = t.id
       JOIN keywords k ON k.id = j.keyword_id
      WHERE k.name = ANY($1) AND t.adult = $2
      ORDER BY t.popularity DESC`,
    [...ADULT_KEYWORDS],
    !target
  );
}

async function flag(kind: "movie" | "series", ids: number[], target: boolean): Promise<number> {
  if (ids.length === 0) return 0;
  const table = kind === "movie" ? "movies" : "series";
  // One statement, PK-keyed; no batching needed at this size (~4.6k rows).
  const result = await prisma.$executeRawUnsafe(
    `UPDATE ${table} SET adult = $1 WHERE id = ANY($2) AND adult = $3`,
    target,
    ids,
    !target
  );
  return result;
}

async function main(): Promise<void> {
  const target = !revert;
  console.log(
    `\n🔎 ${revert ? "REVERT (adult -> false)" : "FLAG (adult -> true)"} by keyword: ${ADULT_KEYWORDS.join(", ")}`
  );
  console.log(`   mode: ${apply ? "APPLY (writes)" : "DRY RUN (no writes)"}\n`);

  let total = 0;
  for (const kind of ["movie", "series"] as const) {
    const all = await candidates(kind, target);
    const skipped = includeCommercial ? [] : all.filter(isCommercial);
    const rows = includeCommercial ? all : all.filter((r) => !isCommercial(r));
    total += rows.length;

    console.log(`${kind.toUpperCase()}: ${rows.length} rows would change`);
    for (const r of rows.slice(0, SAMPLE_SIZE)) {
      console.log(`   ${String(Number(r.popularity).toFixed(1)).padStart(7)}  ${r.title}`);
    }
    if (rows.length > SAMPLE_SIZE) console.log(`   … and ${rows.length - SAMPLE_SIZE} more`);

    // Never silently truncate — the whole point of the guard is that a human
    // can see which titles it spared and disagree.
    if (skipped.length > 0) {
      console.log(
        `\n   ⏭  SKIPPED ${skipped.length} with a commercial footprint (>$${COMMERCIAL_FOOTPRINT_MIN.toLocaleString("en-US")} revenue or budget).`
      );
      console.log("      Pass --include-commercial to flag these too:");
      for (const r of skipped) {
        console.log(
          `      rev=${String(Number(r.revenue ?? 0)).padStart(10)} bud=${String(Number(r.budget ?? 0)).padStart(9)}  ${r.title}`
        );
      }
    }

    if (apply) {
      const changed = await flag(
        kind,
        rows.map((r) => r.id),
        target
      );
      console.log(`   ✅ updated ${changed} ${kind} rows`);
    }
    console.log();
  }

  if (!apply) {
    console.log(`DRY RUN — nothing written. ${total} rows would change. Re-run with --apply.`);
  } else {
    console.log(`Done. ${total} rows targeted.`);
    console.log(
      "Propagation is automatic: ISR revalidate (~1h), CDN (~2h), sitemap on the nightly cron."
    );
  }
}

main()
  .catch((error: unknown) => {
    console.error("❌ Failed:", error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  })
  .finally(() => void prisma.$disconnect());
