/**
 * Tests for the query-time bot predicate.
 *
 * The bar for anything in `BOT_SQL` is DETERMINISM — it feeds the reported human
 * number, so every clause here must be a property no real browser can produce.
 * These tests pin the two additions made Jul 30 2026 (forged Google referer,
 * User-Agent length bounds) and the NULL-safety that keeps the predicate boolean.
 */
import { describe, it, expect } from "vitest";

import {
  BOT_SQL,
  FORCE_BOT_REFERER_SUBSTRINGS,
  FORCE_BOT_UA_EXACT,
  HUMAN_SQL,
  MAX_HUMAN_UA_LENGTH,
  MIN_HUMAN_UA_LENGTH,
} from "./bot-filter";

describe("BOT_SQL structure", () => {
  it("still starts from the frozen ingest flag", () => {
    expect(BOT_SQL).toContain("is_bot = 1");
  });

  it("keeps the CloudFront origin-fetch UA rule", () => {
    expect(FORCE_BOT_UA_EXACT).toContain("Amazon CloudFront");
    expect(BOT_SQL).toContain("'Amazon CloudFront'");
  });

  it("is a single parenthesised OR-chain so it can be embedded anywhere", () => {
    expect(BOT_SQL.startsWith("(")).toBe(true);
    expect(BOT_SQL.endsWith(")")).toBe(true);
    const opens = (BOT_SQL.match(/\(/g) ?? []).length;
    const closes = (BOT_SQL.match(/\)/g) ?? []).length;
    expect(opens).toBe(closes);
  });

  it("exposes HUMAN_SQL as the exact complement", () => {
    expect(HUMAN_SQL).toBe(`NOT ${BOT_SQL}`);
  });
});

describe("forged Google referer rule", () => {
  it("matches the query-carrying Google search referer", () => {
    // Google has stripped the query from organic referers since Oct 2011, so a
    // referer containing /search?q= cannot come from a real result click.
    expect(FORCE_BOT_REFERER_SUBSTRINGS).toContain("google.com/search?q=");
    expect(BOT_SQL).toContain("positionCaseInsensitive(referer, 'google.com/search?q=')");
  });

  it("does NOT match the bare origin-only Google referer that real clicks send", () => {
    // `https://www.google.com/` must stay human — it is what an organic click
    // actually looks like, and it measured ~202 sessions/day against ~147
    // Search Console clicks/day, i.e. broadly consistent.
    for (const sub of FORCE_BOT_REFERER_SUBSTRINGS) {
      expect("https://www.google.com/".includes(sub)).toBe(false);
    }
  });

  it("wraps the referer test in ifNull so a NULL referer stays boolean", () => {
    // `referer` is Nullable. Without ifNull the whole OR-chain evaluates to NULL
    // for referer-less rows, which would drop them out of BOTH buckets.
    expect(BOT_SQL).toContain("ifNull(positionCaseInsensitive(referer,");
  });
});

describe("User-Agent length bounds", () => {
  it("uses Wikimedia's published 25-400 character window", () => {
    expect(MIN_HUMAN_UA_LENGTH).toBe(25);
    expect(MAX_HUMAN_UA_LENGTH).toBe(400);
    expect(BOT_SQL).toContain(`length(user_agent) < ${MIN_HUMAN_UA_LENGTH}`);
    expect(BOT_SQL).toContain(`length(user_agent) > ${MAX_HUMAN_UA_LENGTH}`);
  });

  it("exempts the empty UA so it is not double-counted", () => {
    // An empty UA already gets bot_type='empty_ua' at ingest; without this guard
    // every such row would also trip the length rule.
    expect(BOT_SQL).toContain("length(user_agent) > 0 AND");
  });

  it("keeps a normal browser UA well inside the window", () => {
    const chrome =
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
      "(KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36";
    expect(chrome.length).toBeGreaterThan(MIN_HUMAN_UA_LENGTH);
    expect(chrome.length).toBeLessThan(MAX_HUMAN_UA_LENGTH);
  });
});
