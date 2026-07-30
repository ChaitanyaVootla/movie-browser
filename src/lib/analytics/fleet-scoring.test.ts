/**
 * Tests for the behavioural fleet scorer.
 *
 * The load-bearing test in here is "does NOT flag a real bouncing human cohort":
 * ~50% of genuine sessions have exactly one page view, so any rule that keys off
 * that alone would delete half the real audience. Every fixture below is either
 * a cohort measured on prod (Jul 29-30 2026) or a plausible-human counterexample.
 */
import { describe, it, expect } from "vitest";

import {
  FLEET_RULES,
  FLEET_RULE_LABELS,
  FLEET_THRESHOLDS,
  buildEngagementCtesSql,
  buildFleetCohortSql,
  buildRuleLabelExpr,
  getWindowHours,
  scoreCohort,
  type CohortMetrics,
} from "./fleet-scoring";

const DAY = 24;

/** A cohort with no engagement, sized to clear both volume gates by default. */
function cohort(overrides: Partial<CohortMetrics> = {}): CohortMetrics {
  return {
    views: 5000,
    sessions: 200,
    uniquePaths: 500,
    authedViews: 0,
    actedSessions: 0,
    jsBeaconSessions: 0,
    windowHours: DAY,
    ...overrides,
  };
}

describe("scoreCohort — measured prod fleets are flagged", () => {
  it("flags the US/macOS one-view-per-rotated-IP fleet", () => {
    // Measured 24h: 81,466 views / 81,754 sessions / 81,687 paths, zero beacons.
    const rules = scoreCohort(
      cohort({ views: 81466, sessions: 81754, uniquePaths: 81687, jsBeaconSessions: 0 })
    );
    expect(rules).toContain("no_js");
    expect(rules).toContain("url_sweep");
    expect(rules).toContain("ip_rotation");
    expect(rules).toContain("enumeration");
  });

  it("flags the Vietnamese nav-page hammerer", () => {
    // Measured 24h: 18,316 views / 712 sessions / 1,514 paths — /browse, /topics,
    // /privacy, /terms and a handful more, re-fetched ~26x per session.
    const rules = scoreCohort(
      cohort({ views: 18316, sessions: 712, uniquePaths: 1514, jsBeaconSessions: 3 })
    );
    expect(rules).toContain("nav_hammer");
    expect(rules).toContain("no_js");
  });

  it("flags the Singapore crawler that DOES run our client JS", () => {
    // Measured 24h: 41,630 views / 3,141 sessions / 33,913 paths, 91% beacon
    // share — defeats every rule except catalog enumeration.
    const rules = scoreCohort(
      cohort({ views: 41630, sessions: 3141, uniquePaths: 33913, jsBeaconSessions: 2871 })
    );
    expect(rules).toEqual(["enumeration"]);
  });
});

describe("scoreCohort — real humans are NOT flagged", () => {
  it("does NOT flag a real bouncing cohort where every session is one page view", () => {
    // The mandatory guard. 150 people arrive from search, each views exactly one
    // (different) title and leaves: views == sessions == uniquePaths, i.e. the
    // literal signature of the US fleet above — separated ONLY by volume.
    const rules = scoreCohort(
      cohort({ views: 150, sessions: 150, uniquePaths: 150, jsBeaconSessions: 0 })
    );
    expect(rules).toEqual([]);
  });

  it("does NOT flag a privacy-hardened cohort below the rate gate", () => {
    // 500 views/day with zero beacons (DNT + ad blockers) still fails the
    // 25 views/hour rate gate, so `no_js` never fires.
    const rules = scoreCohort(
      cohort({ views: 500, sessions: 60, uniquePaths: 300, jsBeaconSessions: 0 })
    );
    expect(rules).toEqual([]);
  });

  it("does NOT flag a high-volume cohort that contains a single acting session", () => {
    const base = { views: 81466, sessions: 81754, uniquePaths: 81687, jsBeaconSessions: 0 };
    expect(scoreCohort(cohort(base))).not.toEqual([]);
    expect(scoreCohort(cohort({ ...base, actedSessions: 1 }))).toEqual([]);
    expect(scoreCohort(cohort({ ...base, authedViews: 1 }))).toEqual([]);
  });

  it("does NOT flag an enthusiastic binge cohort with diverse paths", () => {
    // 30 views/session — high, but on 30 DIFFERENT titles each, with a normal
    // ~35% beacon share. `nav_hammer` needs low path diversity; `enumeration`
    // needs thousands of paths/hour.
    const rules = scoreCohort(
      cohort({ views: 3000, sessions: 100, uniquePaths: 1400, jsBeaconSessions: 35 })
    );
    expect(rules).toEqual([]);
  });

  it("does NOT apply the beacon rule to a handful of sessions", () => {
    // One privacy-hardened power user could otherwise satisfy `no_js` alone.
    const rules = scoreCohort(
      cohort({ views: 900, sessions: 4, uniquePaths: 400, jsBeaconSessions: 0 })
    );
    expect(rules).not.toContain("no_js");
  });

  it("does not divide by zero on empty cohorts", () => {
    expect(scoreCohort(cohort({ views: 0, sessions: 0, uniquePaths: 0 }))).toEqual([]);
    expect(scoreCohort(cohort({ views: 5000, sessions: 0 }))).toEqual([]);
  });
});

describe("scoreCohort — threshold behaviour", () => {
  it("scales rate thresholds with the window length", () => {
    // 600 views is 25/hour over 24h (flagged) but 3.6/hour over 7 days (not).
    const measured = { views: 600, sessions: 500, uniquePaths: 590, jsBeaconSessions: 0 };
    expect(scoreCohort(cohort({ ...measured, windowHours: 24 }))).not.toEqual([]);
    expect(scoreCohort(cohort({ ...measured, windowHours: 24 * 7 }))).toEqual([]);
  });

  it("keeps the beacon threshold an order of magnitude below the human rate", () => {
    // Confirmed humans beacon at ~35% (31/88 authed sessions over 30 days).
    expect(FLEET_THRESHOLDS.maxJsBeaconShare).toBeLessThan(0.35 / 10);
  });

  it("labels every rule it can emit", () => {
    for (const rule of FLEET_RULES) {
      expect(FLEET_RULE_LABELS[rule]).toBeTruthy();
    }
  });
});

describe("getWindowHours", () => {
  it("returns whole days for a day range", () => {
    expect(getWindowHours(1)).toBe(24);
    expect(getWindowHours(7)).toBe(168);
    expect(getWindowHours(30)).toBe(720);
  });

  it("returns at least one hour for the since-midnight range", () => {
    const hours = getWindowHours(0);
    expect(hours).toBeGreaterThanOrEqual(1);
    expect(hours).toBeLessThanOrEqual(24);
  });
});

describe("buildFleetCohortSql", () => {
  const sql = buildFleetCohortSql("timestamp >= now() - INTERVAL 1 DAY", "(NOT (is_bot = 1))", 24);

  it("groups by the (user_agent, country) cohort key", () => {
    expect(sql).toContain("GROUP BY user_agent, country");
    expect(sql).toContain("SELECT user_agent, country");
  });

  it("requires zero engagement before any behavioural rule can fire", () => {
    expect(sql).toContain("max(is_authenticated) = 0");
    expect(sql).toContain("uniqIf(session_id, session_id IN acted_sessions) = 0");
  });

  it("gates on both the absolute and the per-hour volume floor", () => {
    expect(sql).toContain(`count() >= ${FLEET_THRESHOLDS.minCohortViews}`);
    expect(sql).toContain(`count() / 24 >= ${FLEET_THRESHOLDS.minViewsPerHour}`);
  });

  it("emits all five behavioural rules", () => {
    expect(sql).toContain(`<= ${FLEET_THRESHOLDS.maxJsBeaconShare}`);
    expect(sql).toContain(`uniq(path) / count() >= ${FLEET_THRESHOLDS.minUrlSweepRatio}`);
    expect(sql).toContain(`uniq(session_id) / 24 >= ${FLEET_THRESHOLDS.minSessionsPerHourForRotation}`);
    expect(sql).toContain(`count() / uniq(session_id) >= ${FLEET_THRESHOLDS.minViewsPerSessionForHammer}`);
    expect(sql).toContain(`uniq(path) / 24 >= ${FLEET_THRESHOLDS.minPathsPerHourForEnumeration}`);
  });

  it("embeds the caller's time condition and scope", () => {
    expect(sql).toContain("timestamp >= now() - INTERVAL 1 DAY");
    expect(sql).toContain("(NOT (is_bot = 1))");
  });

  it("uses no per-row window functions (cost discipline on a 2-vCPU box)", () => {
    expect(sql).not.toContain("OVER (");
    expect(sql).not.toContain("lagInFrame");
  });

  it("never divides by a zero window", () => {
    expect(buildFleetCohortSql("1", "1", 0)).toContain("count() / 1 >=");
  });
});

describe("buildEngagementCtesSql", () => {
  const sql = buildEngagementCtesSql("timestamp >= now() - INTERVAL 7 DAY");

  it("derives acting sessions from user_actions and JS sessions from performance", () => {
    expect(sql).toContain("FROM user_actions");
    expect(sql).toContain("FROM performance");
    expect(sql).toContain("acted_sessions AS");
    expect(sql).toContain("js_sessions AS");
  });

  it("excludes empty session ids so they cannot collapse into one pseudo-session", () => {
    expect(sql.match(/session_id != ''/g)).toHaveLength(2);
  });
});

describe("buildRuleLabelExpr", () => {
  it("emits a label for every rule, in evaluation order", () => {
    const expr = buildRuleLabelExpr(24);
    for (const rule of FLEET_RULES) {
      expect(expr).toContain(`'${rule}'`);
    }
    const positions = FLEET_RULES.map((r) => expr.indexOf(`'${r}'`));
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
  });

  it("references the aliases the cohort query actually selects", () => {
    const expr = buildRuleLabelExpr(24);
    for (const alias of ["js_beacon_sessions", "sessions", "unique_paths", "views"]) {
      expect(expr).toContain(alias);
    }
  });
});
