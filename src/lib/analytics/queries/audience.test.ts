/**
 * Tests for the audience query module.
 *
 * The ClickHouse client is mocked at the `query()` boundary; each test asserts on
 * the SQL that reaches it plus the parsing of the rows that come back. Two
 * regressions are pinned deliberately:
 *
 *  1. `NOT (user_agent, country) IN fleet` — ClickHouse binds `NOT` to the TUPLE
 *     and fails with "Number of arguments for function not doesn't match". The
 *     fleet predicate must always be parenthesised. Caught against prod.
 *  2. Bucket exhaustiveness — crawler + bot + human must partition the rows, or
 *     the "honest split" quietly loses or double-counts traffic.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const queryMock = vi.fn();

vi.mock("../client", () => ({
  query: (sql: string) => queryMock(sql),
}));

import {
  getAbuseFlags,
  getAudienceOverview,
  getAudienceTrend,
  getCrawlerTrend,
  getFleetCohorts,
  getFleetTargets,
  getServedBotTypes,
  getShedReasons,
  getVerifiedCrawlers,
  VISIT_GAP_SECONDS,
} from "./audience";
import { SHED_SQL, VERIFIED_CRAWLER_SQL } from "../audience";

const RANGE = { days: 7 };

beforeEach(() => {
  queryMock.mockReset();
  queryMock.mockResolvedValue([]);
});

/** Every SQL string the mock received, concatenated. */
function allSql(): string {
  return queryMock.mock.calls.map((c) => String(c[0])).join("\n/*----*/\n");
}

describe("getAudienceOverview", () => {
  beforeEach(() => {
    queryMock
      .mockResolvedValueOnce([
        {
          raw_views: "4645542",
          crawler_views: "160683",
          bot_views: "3950961",
          shed_views: "173077",
          flagged_views: "519278",
          human_views: "533898",
          authed_users: "12",
          cohorts: "24",
        },
      ])
      .mockResolvedValueOnce([{ engaged_sessions: "29681", confirmed_sessions: "353" }]);
  });

  it("maps every bucket onto the overview shape", async () => {
    const o = await getAudienceOverview(RANGE);

    expect(o.rawViews).toBe(4645542);
    expect(o.verifiedCrawlerViews).toBe(160683);
    expect(o.botFleetViews).toBe(3950961);
    expect(o.shedViews).toBe(173077);
    expect(o.behaviourallyFlaggedViews).toBe(519278);
    expect(o.humanViews).toBe(533898);
    expect(o.engagedHumanSessions).toBe(29681);
    expect(o.confirmedHumanSessions).toBe(353);
    expect(o.authenticatedUsers).toBe(12);
    expect(o.flaggedCohorts).toBe(24);
  });

  it("runs exactly two queries (the cohort count rides on the totals)", async () => {
    await getAudienceOverview(RANGE);
    expect(queryMock).toHaveBeenCalledTimes(2);
    expect(allSql()).toContain("uniqIf(tuple(user_agent, country)");
    expect(allSql()).not.toMatch(/SELECT\s+count\(\) AS cohorts FROM fleet/);
  });

  it("parenthesises the fleet tuple predicate under NOT", async () => {
    await getAudienceOverview(RANGE);
    const sql = allSql();
    // The bug: `NOT (user_agent, country) IN fleet` is parsed as not(tuple).
    expect(sql).toContain("NOT ((user_agent, country) IN fleet)");
    expect(sql).not.toMatch(/NOT \(user_agent, country\) IN fleet/);
  });

  it("declares the engagement CTEs before referencing them", async () => {
    await getAudienceOverview(RANGE);
    const sql = queryMock.mock.calls[0][0] as string;
    expect(sql.indexOf("acted_sessions AS")).toBeLessThan(sql.indexOf("IN acted_sessions"));
    expect(sql.indexOf("js_sessions AS")).toBeLessThan(sql.lastIndexOf("IN js_sessions"));
  });

  it("sessionizes engaged visits on the 30-minute inactivity gap", async () => {
    await getAudienceOverview(RANGE);
    const sql = queryMock.mock.calls[1][0] as string;

    expect(VISIT_GAP_SECONDS).toBe(1800);
    expect(sql).toContain("lagInFrame(timestamp)");
    expect(sql).toContain(`> ${VISIT_GAP_SECONDS}`);
    expect(sql).toContain("sum(is_new_visit) OVER");
    // 2+ views WITHIN one visit — not 2+ views across days under one fingerprint.
    expect(sql).toContain("HAVING max_visit_views >= 2 OR confirmed = 1");
  });

  it("scopes engaged sessions to the human bucket only", async () => {
    await getAudienceOverview(RANGE);
    const sql = queryMock.mock.calls[1][0] as string;
    expect(sql).toContain("NOT ((user_agent, country) IN fleet)");
    expect(sql).toContain("session_id != ''");
  });

  it("returns zeroes rather than NaN when ClickHouse returns nothing", async () => {
    queryMock.mockReset();
    queryMock.mockResolvedValue([]);

    const o = await getAudienceOverview(RANGE);
    expect(o.rawViews).toBe(0);
    expect(o.engagedHumanSessions).toBe(0);
    expect(o.confirmedHumanSessions).toBe(0);
  });
});

describe("audience buckets partition the traffic", () => {
  it("counts crawler, bot and human buckets over one unfiltered scan", async () => {
    await getAudienceTrend(RANGE, "hour");
    const sql = queryMock.mock.calls[0][0] as string;

    // All buckets are countIf() over the SAME rows — a shared WHERE that already
    // narrowed the scope is what made the old "Bot Traffic" tile read 0.
    expect(sql).toContain("countIf(");
    expect(sql).toContain("count() AS raw_views");
    expect(sql).not.toMatch(/WHERE[^)]*is_bot = 0/);
  });

  it("keeps the crawler bucket disjoint from the bot bucket", async () => {
    await getAudienceTrend(RANGE);
    const sql = queryMock.mock.calls[0][0] as string;
    expect(sql).toContain(`countIf(${VERIFIED_CRAWLER_SQL})`);
    expect(sql).toContain(`NOT ${VERIFIED_CRAWLER_SQL}`);
  });

  it("buckets by hour or by day on request", async () => {
    await getAudienceTrend(RANGE, "hour");
    expect(queryMock.mock.calls[0][0]).toContain("toStartOfHour(timestamp)");

    queryMock.mockReset();
    queryMock.mockResolvedValue([]);
    await getAudienceTrend(RANGE, "day");
    expect(queryMock.mock.calls[0][0]).toContain("toDate(timestamp)");
  });

  it("reports the confirmed-human floor per bucket alongside the upper bound", async () => {
    queryMock.mockReset();
    queryMock.mockResolvedValueOnce([
      {
        b: "2026-07-29",
        crawler_views: "84589",
        bot_views: "193148",
        human_views: "205263",
        confirmed_views: "1841",
        raw_views: "755135",
      },
    ]);

    const [point] = await getAudienceTrend(RANGE);
    expect(point.confirmedHumanViews).toBe(1841);
    expect(point.humanViews).toBe(205263);
    expect(point.rawViews).toBe(755135);
  });
});

describe("getFleetCohorts", () => {
  beforeEach(() => {
    queryMock.mockReset();
    queryMock.mockResolvedValue([
      {
        user_agent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/145",
        country: "US",
        views: "81466",
        sessions: "81754",
        unique_paths: "81687",
        js_beacon_sessions: "0",
        top_page_type: "person",
        rules: "no_js+url_sweep+ip_rotation+enumeration",
      },
    ]);
  });

  it("returns the discriminators, not just the volume", async () => {
    const [c] = await getFleetCohorts(RANGE);

    expect(c.views).toBe(81466);
    expect(c.sessions).toBe(81754);
    expect(c.uniquePaths).toBe(81687);
    expect(c.viewsPerSession).toBeCloseTo(81466 / 81754, 4);
    expect(c.pathRatio).toBeCloseTo(81687 / 81466, 4);
    expect(c.jsBeaconShare).toBe(0);
    expect(c.topPageType).toBe("person");
  });

  it("splits the packed rule labels", async () => {
    const [c] = await getFleetCohorts(RANGE);
    expect(c.rules).toEqual(["no_js", "url_sweep", "ip_rotation", "enumeration"]);
  });

  it("yields an empty rule list rather than [''] when nothing matched", async () => {
    queryMock.mockReset();
    queryMock.mockResolvedValue([
      { user_agent: "x", country: "US", views: "1", sessions: "1", unique_paths: "1", rules: "" },
    ]);
    const [c] = await getFleetCohorts(RANGE);
    expect(c.rules).toEqual([]);
  });

  it("never divides by zero", async () => {
    queryMock.mockReset();
    queryMock.mockResolvedValue([
      { user_agent: "x", country: "US", views: "0", sessions: "0", unique_paths: "0", rules: "" },
    ]);
    const [c] = await getFleetCohorts(RANGE);
    expect(c.viewsPerSession).toBe(0);
    expect(c.pathRatio).toBe(0);
    expect(c.jsBeaconShare).toBe(0);
  });

  it("restricts to flagged cohorts inside the human pool", async () => {
    await getFleetCohorts(RANGE);
    const sql = queryMock.mock.calls[0][0] as string;
    expect(sql).toContain("((user_agent, country) IN fleet)");
    expect(sql).toContain("GROUP BY user_agent, country");
  });

  it("applies the caller's limit", async () => {
    await getFleetCohorts(RANGE, 5);
    expect(queryMock.mock.calls[0][0]).toContain("LIMIT 5");
  });
});

describe("shed reporting", () => {
  it("labels each shed reason for the abuse panel", async () => {
    queryMock.mockReset();
    queryMock.mockResolvedValue([
      { bot_type: "markdown_scraper", views: "33510", unique_paths: "33509" },
      { bot_type: "stale_chrome", views: "17100", unique_paths: "9191" },
    ]);

    const rows = await getShedReasons(RANGE);
    expect(rows[0].label).toBe("LLM scraper (Accept: text/markdown)");
    expect(rows[1].label).toBe("Chrome ≤ 109 (stale UA)");
    expect(rows[0].views).toBe(33510);
  });

  it("falls back to the raw bot_type for an unlabelled reason", async () => {
    queryMock.mockReset();
    queryMock.mockResolvedValue([{ bot_type: "brand_new_label", views: "5", unique_paths: "5" }]);
    const [row] = await getShedReasons(RANGE);
    expect(row.label).toBe("brand_new_label");
  });

  it("carries the shed count on the audience trend, not a second scan", async () => {
    queryMock.mockReset();
    queryMock.mockResolvedValue([]);
    await getAudienceTrend(RANGE, "day");
    const sql = queryMock.mock.calls[0][0] as string;
    expect(sql).toContain(`countIf(${SHED_SQL}) AS shed_views`);
    expect(queryMock).toHaveBeenCalledTimes(1);
  });

  it("shortlists served bot types that are neither shed nor wanted crawlers", async () => {
    queryMock.mockReset();
    queryMock.mockResolvedValue([]);
    await getServedBotTypes(RANGE);
    const sql = queryMock.mock.calls[0][0] as string;
    expect(sql).toContain(`NOT ${VERIFIED_CRAWLER_SQL}`);
    expect(sql).toContain(`NOT ${SHED_SQL}`);
    expect(sql).toContain("bot_type != ''");
  });
});

describe("getFleetTargets", () => {
  it("groups by page_type by default and by path on request", async () => {
    await getFleetTargets(RANGE);
    expect(queryMock.mock.calls[0][0]).toContain("SELECT page_type AS k");

    queryMock.mockReset();
    queryMock.mockResolvedValue([]);
    await getFleetTargets(RANGE, "path");
    expect(queryMock.mock.calls[0][0]).toContain("SELECT path AS k");
  });

  it("labels an empty key rather than rendering a blank row", async () => {
    queryMock.mockReset();
    queryMock.mockResolvedValue([{ k: "", views: "10", unique_paths: "1" }]);
    const [row] = await getFleetTargets(RANGE);
    expect(row.key).toBe("(none)");
  });
});

describe("getAbuseFlags", () => {
  it("measures the referer and beacon flags over the HUMAN pool only", async () => {
    queryMock.mockReset();
    queryMock.mockResolvedValue([
      {
        google_views: "706",
        google_sessions: "663",
        no_referer_views: "32409",
        no_beacon_sessions: "27945",
        pool_sessions: "32241",
      },
    ]);

    const flags = await getAbuseFlags(RANGE);
    expect(flags.googleRefererSessions).toBe(663);
    expect(flags.noBeaconSessions).toBe(27945);
    expect(flags.humanPoolSessions).toBe(32241);

    // These are FLAGS. They must never appear in a predicate that reduces a
    // human count — only in this read-only measurement query.
    const sql = queryMock.mock.calls[0][0] as string;
    expect(sql).toContain("NOT ((user_agent, country) IN fleet)");
    expect(sql).toContain("countIf(referer LIKE '%google.%')");
  });
});

describe("verified crawlers", () => {
  it("reports volume, unique paths crawled, active days and top page type", async () => {
    queryMock.mockReset();
    queryMock.mockResolvedValue([
      {
        bot_type: "googlebot",
        views: "53437",
        unique_paths: "52713",
        active_days: "2",
        top_page_type: "person",
      },
    ]);

    const [row] = await getVerifiedCrawlers(RANGE);
    expect(row.botType).toBe("googlebot");
    expect(row.uniquePaths).toBe(52713);
    expect(row.activeDays).toBe(2);
    expect(row.topPageType).toBe("person");
  });

  it("scopes to the wanted-crawler predicate", async () => {
    queryMock.mockReset();
    queryMock.mockResolvedValue([]);
    await getVerifiedCrawlers(RANGE);
    expect(queryMock.mock.calls[0][0]).toContain(VERIFIED_CRAWLER_SQL);
  });

  it("pivots the crawler trend into one sparse record per bucket", async () => {
    queryMock.mockReset();
    queryMock.mockResolvedValue([
      { b: "2026-07-28", bot_type: "googlebot", views: "61481" },
      { b: "2026-07-28", bot_type: "bingbot", views: "8640" },
      { b: "2026-07-29", bot_type: "googlebot", views: "71234" },
    ]);

    const points = await getCrawlerTrend(RANGE);
    expect(points).toHaveLength(2);
    expect(points[0]).toEqual({ date: "2026-07-28", byCrawler: { googlebot: 61481, bingbot: 8640 } });
    expect(points[1].byCrawler).toEqual({ googlebot: 71234 });
  });

  it("limits the trend to the busiest crawlers", async () => {
    queryMock.mockReset();
    queryMock.mockResolvedValue([]);
    await getCrawlerTrend(RANGE, "day", 3);
    expect(queryMock.mock.calls[0][0]).toContain("LIMIT 3");
  });
});
