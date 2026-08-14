/**
 * Pins the product-analytics scope predicates and the conversion-rate helper.
 *
 * Same rationale as `llm-layer.test.ts` and `adult-filter.test.ts`: these are
 * strings interpolated into ClickHouse SQL, so a predicate that silently widens
 * (letting the fleet back into the denominator) or narrows (dropping real
 * sessions) still typechecks and still returns rows — just wrong ones. The whole
 * value of the panel is that its denominator cannot be inflated by a bot, and
 * that property lives entirely in these two fragments.
 */

import { describe, it, expect } from "vitest";
import {
  CONVERSION_ACTIONS,
  actingSessionSql,
  confirmedHumanViewerSql,
  conversionRate,
} from "./product";

describe("CONVERSION_ACTIONS", () => {
  it("is exactly the six metrics getItemAnalytics computes per title", () => {
    expect([...CONVERSION_ACTIONS]).toEqual([
      "watchlist_add",
      "watchlist_remove",
      "rate_like",
      "rate_dislike",
      "watch_click",
      "trailer_play",
    ]);
  });

  it("excludes navigation chrome that also carries an item_id", () => {
    // carousel_nav is the single highest-volume action on the site (1,258 over 30
    // days vs 90 watchlist adds) and says nothing about the title it points at.
    for (const noise of ["carousel_nav", "gallery_nav", "gallery_open"]) {
      expect(CONVERSION_ACTIONS).not.toContain(noise);
    }
  });
});

describe("actingSessionSql", () => {
  it("filters bots and empty session ids", () => {
    const sql = actingSessionSql({ days: 7 });
    expect(sql).toContain("FROM user_actions");
    expect(sql).toContain("is_bot = 0");
    expect(sql).toContain("session_id != ''");
  });

  it("never applies HUMAN_SQL to user_actions", () => {
    // `user_actions` has no `user_agent`/`referer` column, so the bot-filter
    // fragments cannot be evaluated against it — pasting them in would be a
    // query-time "unknown identifier" error, not a compile error.
    const sql = actingSessionSql({ days: 30 });
    expect(sql).not.toContain("user_agent");
    expect(sql).not.toContain("referer");
  });

  it("carries the requested window", () => {
    expect(actingSessionSql({ days: 30 })).toContain("INTERVAL 30 DAY");
    expect(actingSessionSql({ days: 7 })).toContain("INTERVAL 7 DAY");
  });

  it("uses the start-of-day bound for the today range", () => {
    // range.days === 0 means "today", not "no time filter" — an unbounded scan
    // here would read the whole table on a 0.9-CPU ClickHouse.
    expect(actingSessionSql({ days: 0 })).toContain("toStartOfDay(now())");
  });
});

describe("confirmedHumanViewerSql", () => {
  it("admits a session that is authenticated OR acted", () => {
    const sql = confirmedHumanViewerSql({ days: 7 });
    expect(sql).toContain("is_authenticated = 1");
    expect(sql).toContain("session_id IN (");
    expect(sql.startsWith("(")).toBe(true);
    expect(sql.endsWith(")")).toBe(true);
  });

  it("is a disjunction, not a conjunction", () => {
    // An AND here would collapse the floor to authenticated-only (2,710 views
    // over 30 days instead of 61,345) and make every conversion rate nonsense.
    const sql = confirmedHumanViewerSql({ days: 7 });
    expect(sql).toContain(" OR ");
    expect(sql).not.toMatch(/is_authenticated = 1\s+AND/);
  });

  it("drops the auth half for tables without the column", () => {
    // `performance` has no `is_authenticated` column; referencing it there is a
    // query-time error.
    const sql = confirmedHumanViewerSql({ days: 7 }, false);
    expect(sql).not.toContain("is_authenticated");
    expect(sql).toContain("session_id IN (");
  });

  it("stays parenthesised as a whole so it can be ANDed safely", () => {
    // Precedence trap: an unparenthesised `a = 1 OR b IN (...)` ANDed onto a
    // WHERE clause silently changes which rows match.
    for (const sql of [
      confirmedHumanViewerSql({ days: 7 }),
      confirmedHumanViewerSql({ days: 7 }, false),
    ]) {
      expect(sql.startsWith("(")).toBe(true);
      expect(sql.endsWith(")")).toBe(true);
    }
  });
});

describe("conversionRate", () => {
  it("computes acting sessions as a percentage of visitors", () => {
    expect(conversionRate(15, 42)).toBeCloseTo(35.714, 3);
    expect(conversionRate(6, 18)).toBeCloseTo(33.333, 3);
    expect(conversionRate(1, 1)).toBe(100);
  });

  it("returns null rather than 0 when there is no denominator", () => {
    // A title can have actions but no view rows: `page_views` is written at the
    // origin, so a CloudFront edge HIT records no view while the action beacon
    // still arrives. "Unknown" and "zero" are different facts.
    expect(conversionRate(3, 0)).toBeNull();
    expect(conversionRate(0, 0)).toBeNull();
    expect(conversionRate(0, -1)).toBeNull();
  });

  it("reports zero engagement as 0, not null", () => {
    expect(conversionRate(0, 50)).toBe(0);
  });

  it("does not clamp above 100", () => {
    // Above 100% means the view rows are missing (edge-served); clamping would
    // hide exactly that.
    expect(conversionRate(5, 2)).toBe(250);
  });
});
