/**
 * Tests for the traffic overview queries.
 *
 * These pin the two bugs that made the admin "Session Metrics" card useless:
 * duration/bounce read an empty `sessions` table (permanent "—"), and the bot
 * count was computed inside a WHERE that had already excluded bots (always 0
 * with "Human only" on). The ClickHouse client is mocked at the `query()`
 * boundary and each test asserts on the SQL that reaches it.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const queryMock = vi.fn();

vi.mock("../client", () => ({
  query: (sql: string) => queryMock(sql),
}));

import { buildVisitMetricsSql, getTrafficOverview, VISIT_GAP_SECONDS } from "./traffic";
import { BOT_SQL, HUMAN_SQL } from "../bot-filter";

const RANGE = { days: 7 };

/** Rows for the 3 queries getTrafficOverview runs, in order. */
function mockOverviewRows(overrides?: {
  totals?: Record<string, string>;
  engaged?: Record<string, string>;
  visits?: Record<string, string>;
}) {
  const totals = {
    page_views: "1000",
    unique_sessions: "400",
    unique_users: "12",
    bot_views: "900",
    ...overrides?.totals,
  };
  const engaged = { engaged_sessions: "40", ...overrides?.engaged };
  const visits = { visits: "50", bounces: "20", avg_duration: "474.5", ...overrides?.visits };

  queryMock
    .mockResolvedValueOnce([totals])
    .mockResolvedValueOnce([engaged])
    .mockResolvedValueOnce([visits]);
}

beforeEach(() => {
  queryMock.mockReset();
});

describe("buildVisitMetricsSql", () => {
  const sql = buildVisitMetricsSql("timestamp >= now() - INTERVAL 7 DAY");

  it("reads page_views, never the (never-written) sessions table", () => {
    expect(sql).toContain("FROM page_views");
    expect(sql).not.toMatch(/\bFROM sessions\b/);
    expect(sql).not.toContain("duration_seconds");
    expect(sql).not.toContain("bounce = 1");
  });

  it("splits visits on the 30-minute inactivity gap", () => {
    expect(VISIT_GAP_SECONDS).toBe(1800);
    expect(sql).toContain("lagInFrame(timestamp)");
    expect(sql).toContain(`> ${VISIT_GAP_SECONDS}`);
    // The running total of gap markers is what numbers the visits.
    expect(sql).toContain("sum(is_new_visit) OVER");
    expect(sql).toContain("GROUP BY session_id, visit_no");
  });

  it("scopes to human rows with a parseable session id", () => {
    expect(sql).toContain(HUMAN_SQL);
    expect(sql).toContain("session_id != ''");
  });

  it("returns visit count, bounce count and mean duration", () => {
    expect(sql).toContain("count() AS visits");
    expect(sql).toContain("countIf(views = 1) AS bounces");
    expect(sql).toContain("avg(duration) AS avg_duration");
  });

  it("embeds the caller's time condition", () => {
    expect(buildVisitMetricsSql("timestamp >= toStartOfDay(now())")).toContain(
      "timestamp >= toStartOfDay(now())"
    );
  });
});

describe("getTrafficOverview", () => {
  it("derives duration and bounce rate from the visit query", async () => {
    mockOverviewRows({ visits: { visits: "50", bounces: "20", avg_duration: "474.5" } });

    const overview = await getTrafficOverview(RANGE);

    expect(overview.visits).toBe(50);
    expect(overview.avgSessionDuration).toBeCloseTo(474.5);
    expect(overview.bounceRate).toBeCloseTo(0.4);
  });

  it("reports zero bounce rate rather than NaN when there are no visits", async () => {
    mockOverviewRows({ visits: { visits: "0", bounces: "0", avg_duration: "0" } });

    const overview = await getTrafficOverview(RANGE);

    expect(overview.visits).toBe(0);
    expect(overview.bounceRate).toBe(0);
  });

  it("counts bot views outside the human scope when humanOnly is on", async () => {
    mockOverviewRows();

    const overview = await getTrafficOverview(RANGE, true);
    const totalsSql = queryMock.mock.calls[0][0] as string;

    // The human predicate must be a countIf condition, NOT a WHERE filter —
    // otherwise countIf(BOT_SQL) can only ever be 0.
    expect(totalsSql).toContain(`countIf(${HUMAN_SQL}) AS page_views`);
    expect(totalsSql).toContain(`countIf(${BOT_SQL}) AS bot_views`);
    expect(totalsSql).not.toContain(`AND ${HUMAN_SQL}\n`);
    expect(overview.botViews).toBe(900);
  });

  it("counts all traffic as page views when humanOnly is off", async () => {
    mockOverviewRows();

    await getTrafficOverview(RANGE, false);
    const totalsSql = queryMock.mock.calls[0][0] as string;

    expect(totalsSql).toContain("countIf(1) AS page_views");
    expect(totalsSql).toContain(`countIf(${BOT_SQL}) AS bot_views`);
  });

  it("keeps visit metrics human-scoped regardless of the humanOnly toggle", async () => {
    mockOverviewRows();
    await getTrafficOverview(RANGE, false);

    const visitSql = queryMock.mock.calls[2][0] as string;
    expect(visitSql).toContain(HUMAN_SQL);
  });
});
