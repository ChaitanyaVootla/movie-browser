/**
 * Adult-content SQL predicates, shared by every raw-SQL discovery query.
 *
 * Adult titles and performers are de-listed from every LIST/LINK surface. They
 * stay reachable by direct URL (the pages work, they just carry `robots:
 * noindex, nofollow`), but nothing may LINK to them: an indexed page linking to
 * ~115k adult movies burns Googlebot's already-throttled crawl budget on pages
 * we do not want indexed, starving the mainstream catalog, and it risks the
 * whole domain being classified adult-oriented and SafeSearch-filtered.
 *
 * `IS NOT TRUE` rather than `= false`: the columns are `@default(false)` so in
 * practice there are no NULLs, but this matches the sitemap generator's
 * long-standing convention and stays correct for any row predating a backfill.
 *
 * These are constant SQL fragments with no user input — safe to interpolate into
 * a `$queryRawUnsafe` template. See `.claude/rules/seo-search-console.md`.
 */

/**
 * `adult IS NOT TRUE` for the given table alias, e.g. `notAdult("m")`.
 *
 * Only for `$queryRawUnsafe` string-built SQL. Prisma's `$queryRaw` TAGGED
 * templates cannot use this — an `${…}` there becomes a bind parameter, not SQL
 * — so those queries spell the predicate out inline.
 */
export function notAdult(alias: string): string {
  return `${alias}.adult IS NOT TRUE`;
}
