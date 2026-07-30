/**
 * Tests for the three-way audience taxonomy.
 *
 * The buckets must be mutually exclusive and jointly exhaustive — if they are
 * not, the rebuilt Traffic tab silently double-counts or loses traffic, which is
 * the exact class of bug it exists to fix.
 */
import { describe, it, expect } from "vitest";

import {
  CRAWLER_LABELS,
  KNOWN_BOT_NON_CRAWLER_SQL,
  OTHER_BOT_LABELS,
  SHED_BOT_TYPES,
  SHED_REASON_LABELS,
  SHED_SQL,
  UNCLASSIFIED_SQL,
  VERIFIED_CRAWLER_BOT_TYPES,
  VERIFIED_CRAWLER_SQL,
} from "./audience";
import { BOT_SQL } from "./bot-filter";
import { detectBot, getBotTypesByCategory } from "./bot-detection";

describe("VERIFIED_CRAWLER_BOT_TYPES", () => {
  it("contains the search engines whose crawl budget matters", () => {
    for (const type of ["googlebot", "bingbot", "apple", "duckduckgo", "yandex"]) {
      expect(VERIFIED_CRAWLER_BOT_TYPES).toContain(type);
    }
  });

  it("includes ChatGPT-User, which the proxy deliberately does not shed", () => {
    expect(VERIFIED_CRAWLER_BOT_TYPES).toContain("chatgpt");
  });

  it("never contains a bot type the shed 429s", () => {
    for (const shed of SHED_BOT_TYPES) {
      expect(VERIFIED_CRAWLER_BOT_TYPES).not.toContain(shed);
    }
  });

  it("stays in sync with the ingest pattern table (no hand-maintained drift)", () => {
    // Derived, not copied — a new search engine added to bot-detection.ts shows
    // up here automatically.
    for (const type of getBotTypesByCategory("search_engine")) {
      expect(VERIFIED_CRAWLER_BOT_TYPES).toContain(type);
    }
  });

  it("uses real bot types, i.e. strings ingest can actually write", () => {
    expect(detectBot("Mozilla/5.0 (compatible; Googlebot/2.1)").botType).toBe("googlebot");
    expect(detectBot("ChatGPT-User/1.0").botType).toBe("chatgpt");
  });
});

describe("SQL fragments", () => {
  it("requires is_bot = 1 for a crawler, so a forged bot_type cannot launder a row", () => {
    expect(VERIFIED_CRAWLER_SQL).toContain("is_bot = 1");
  });

  it("makes the bot bucket the complement of the crawler bucket within BOT_SQL", () => {
    expect(KNOWN_BOT_NON_CRAWLER_SQL).toContain(BOT_SQL);
    expect(KNOWN_BOT_NON_CRAWLER_SQL).toContain(`NOT ${VERIFIED_CRAWLER_SQL}`);
  });

  it("makes the human pool the exact complement of BOT_SQL", () => {
    expect(UNCLASSIFIED_SQL).toBe(`(NOT ${BOT_SQL})`);
  });

  it("quotes every bot_type literal", () => {
    for (const type of [...VERIFIED_CRAWLER_BOT_TYPES, ...SHED_BOT_TYPES]) {
      expect(VERIFIED_CRAWLER_SQL.includes(`'${type}'`) || SHED_SQL.includes(`'${type}'`)).toBe(
        true
      );
    }
  });

  it("emits no unquoted or unbalanced SQL", () => {
    for (const sql of [VERIFIED_CRAWLER_SQL, SHED_SQL, KNOWN_BOT_NON_CRAWLER_SQL, UNCLASSIFIED_SQL]) {
      const opens = (sql.match(/\(/g) ?? []).length;
      const closes = (sql.match(/\)/g) ?? []).length;
      expect(opens).toBe(closes);
      expect((sql.match(/'/g) ?? []).length % 2).toBe(0);
    }
  });
});

describe("display metadata", () => {
  it("labels every shed reason", () => {
    for (const type of SHED_BOT_TYPES) {
      expect(SHED_REASON_LABELS[type]).toBeTruthy();
    }
  });

  it("labels the crawlers the dashboard is likely to show", () => {
    for (const type of ["googlebot", "bingbot", "apple", "chatgpt"]) {
      expect(CRAWLER_LABELS[type]).toBeTruthy();
    }
  });

  it("keeps the analytics-only datacenter label out of both the crawler and shed sets", () => {
    for (const label of OTHER_BOT_LABELS) {
      expect(VERIFIED_CRAWLER_BOT_TYPES).not.toContain(label);
      expect(SHED_BOT_TYPES).not.toContain(label);
    }
  });
});
