/**
 * Analytics Alert System
 *
 * Alert definitions and detection logic for the admin dashboard.
 * Alerts are checked on-demand when the dashboard loads.
 */

import { query } from "./client";

// =============================================================================
// Types
// =============================================================================

export type AlertSeverity = "critical" | "warning" | "info";
export type AlertCategory = "ai" | "errors" | "performance" | "traffic" | "cache";

export interface Alert {
  id: string;
  severity: AlertSeverity;
  category: AlertCategory;
  title: string;
  message: string;
  value: number | string;
  threshold: number | string;
  detectedAt: string;
  /** Optional action URL */
  actionUrl?: string;
}

export interface AlertCheckResult {
  alerts: Alert[];
  checkedAt: string;
  durationMs: number;
}

// =============================================================================
// Alert Thresholds (Configurable)
// =============================================================================

export const ALERT_THRESHOLDS = {
  // AI Cost Alerts
  ai: {
    /** Daily cost spike: >2x of 7-day average */
    dailyCostSpikeMultiplier: 2,
    /** Absolute daily cost warning (USD) */
    dailyCostWarning: 5,
    /** Absolute daily cost critical (USD) */
    dailyCostCritical: 10,
    /** Single invocation cost warning (USD) */
    singleInvocationWarning: 0.5,
  },

  // Error Rate Alerts
  errors: {
    /** Error rate percentage in last hour */
    errorRateWarning: 3,
    errorRateCritical: 5,
    /** Critical error count in last hour */
    criticalErrorsWarning: 5,
    criticalErrorsCritical: 10,
    /** Unique error types spike */
    uniqueErrorTypesWarning: 10,
  },

  // Performance Alerts
  performance: {
    /** P75 LCP threshold (ms) */
    lcpWarning: 2500,
    lcpCritical: 4000,
    /** P75 CLS threshold */
    clsWarning: 0.1,
    clsCritical: 0.25,
    /** P75 INP threshold (ms) */
    inpWarning: 200,
    inpCritical: 500,
  },

  // Cache Alerts
  cache: {
    /** L1 hit rate warning (%) */
    l1HitRateWarning: 50,
    l1HitRateCritical: 30,
    /** L2 hit rate warning (%) */
    l2HitRateWarning: 60,
    l2HitRateCritical: 40,
    /** Fetch errors in last hour */
    fetchErrorsWarning: 10,
    fetchErrorsCritical: 50,
  },

  // Traffic Alerts
  traffic: {
    /** Traffic drop: <50% of 7-day average */
    trafficDropMultiplier: 0.5,
    /** Bot traffic percentage */
    botTrafficWarning: 30,
    botTrafficCritical: 50,
  },
} as const;

// =============================================================================
// Alert Check Functions
// =============================================================================

/**
 * Check all alerts and return active ones
 */
export async function checkAllAlerts(): Promise<AlertCheckResult> {
  const startTime = Date.now();
  const alerts: Alert[] = [];

  try {
    // Run all checks in parallel for speed
    const [aiAlerts, errorAlerts, perfAlerts, cacheAlerts, trafficAlerts] = await Promise.all([
      checkAIAlerts().catch(() => []),
      checkErrorAlerts().catch(() => []),
      checkPerformanceAlerts().catch(() => []),
      checkCacheAlerts().catch(() => []),
      checkTrafficAlerts().catch(() => []),
    ]);

    alerts.push(...aiAlerts, ...errorAlerts, ...perfAlerts, ...cacheAlerts, ...trafficAlerts);

    // Sort by severity: critical > warning > info
    const severityOrder: Record<AlertSeverity, number> = { critical: 0, warning: 1, info: 2 };
    alerts.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);
  } catch (error) {
    // If analytics is down, return a system alert
    alerts.push({
      id: "analytics-unavailable",
      severity: "warning",
      category: "cache",
      title: "Analytics Unavailable",
      message: "Could not connect to ClickHouse. Analytics data may be unavailable.",
      value: "disconnected",
      threshold: "connected",
      detectedAt: new Date().toISOString(),
    });
  }

  return {
    alerts,
    checkedAt: new Date().toISOString(),
    durationMs: Date.now() - startTime,
  };
}

// =============================================================================
// Individual Alert Checks
// =============================================================================

/**
 * Check AI usage alerts
 */
async function checkAIAlerts(): Promise<Alert[]> {
  const alerts: Alert[] = [];
  const now = new Date().toISOString();

  // Daily cost check
  const [todayCost] = await query<{ cost: string }>(`
    SELECT sum(total_cost) AS cost
    FROM ai_usage
    WHERE timestamp >= today()
  `);

  const [avgCost] = await query<{ avg_cost: string }>(`
    SELECT avg(daily_cost) AS avg_cost
    FROM (
      SELECT toDate(timestamp) AS date, sum(total_cost) AS daily_cost
      FROM ai_usage
      WHERE timestamp >= today() - INTERVAL 7 DAY AND timestamp < today()
      GROUP BY date
    )
  `);

  const todayTotal = parseFloat(todayCost?.cost || "0");
  const avgDaily = parseFloat(avgCost?.avg_cost || "0");

  // Check absolute thresholds first
  if (todayTotal >= ALERT_THRESHOLDS.ai.dailyCostCritical) {
    alerts.push({
      id: "ai-cost-critical",
      severity: "critical",
      category: "ai",
      title: "AI Cost Critical",
      message: `Today's AI spending ($${todayTotal.toFixed(2)}) exceeds critical threshold.`,
      value: todayTotal,
      threshold: ALERT_THRESHOLDS.ai.dailyCostCritical,
      detectedAt: now,
    });
  } else if (todayTotal >= ALERT_THRESHOLDS.ai.dailyCostWarning) {
    alerts.push({
      id: "ai-cost-warning",
      severity: "warning",
      category: "ai",
      title: "AI Cost Warning",
      message: `Today's AI spending ($${todayTotal.toFixed(2)}) is approaching limits.`,
      value: todayTotal,
      threshold: ALERT_THRESHOLDS.ai.dailyCostWarning,
      detectedAt: now,
    });
  }

  // Check spike vs average (only if we have history)
  if (avgDaily > 0 && todayTotal > avgDaily * ALERT_THRESHOLDS.ai.dailyCostSpikeMultiplier) {
    alerts.push({
      id: "ai-cost-spike",
      severity: "warning",
      category: "ai",
      title: "AI Cost Spike",
      message: `Today's cost ($${todayTotal.toFixed(2)}) is ${(todayTotal / avgDaily).toFixed(1)}x the 7-day average ($${avgDaily.toFixed(2)}).`,
      value: todayTotal,
      threshold: `${avgDaily * ALERT_THRESHOLDS.ai.dailyCostSpikeMultiplier}`,
      detectedAt: now,
    });
  }

  // Check for expensive single invocations
  const [expensiveCall] = await query<{ max_cost: string; query_sample: string }>(`
    SELECT max(total_cost) AS max_cost, any(query) AS query_sample
    FROM ai_usage
    WHERE timestamp >= today() AND total_cost >= ${ALERT_THRESHOLDS.ai.singleInvocationWarning}
  `);

  if (expensiveCall && parseFloat(expensiveCall.max_cost) >= ALERT_THRESHOLDS.ai.singleInvocationWarning) {
    alerts.push({
      id: "ai-expensive-call",
      severity: "info",
      category: "ai",
      title: "Expensive AI Call Detected",
      message: `A single invocation cost $${parseFloat(expensiveCall.max_cost).toFixed(3)}: "${expensiveCall.query_sample?.slice(0, 50)}..."`,
      value: parseFloat(expensiveCall.max_cost),
      threshold: ALERT_THRESHOLDS.ai.singleInvocationWarning,
      detectedAt: now,
    });
  }

  return alerts;
}

/**
 * Check error rate alerts
 */
async function checkErrorAlerts(): Promise<Alert[]> {
  const alerts: Alert[] = [];
  const now = new Date().toISOString();

  // Error rate in last hour
  const [errorRate] = await query<{
    errors: string;
    page_views: string;
    rate: string;
  }>(`
    SELECT 
      (SELECT count() FROM errors WHERE timestamp >= now() - INTERVAL 1 HOUR) AS errors,
      (SELECT count() FROM page_views WHERE timestamp >= now() - INTERVAL 1 HOUR AND is_bot = 0) AS page_views,
      if(page_views > 0, errors / page_views * 100, 0) AS rate
  `);

  const rate = parseFloat(errorRate?.rate || "0");
  const errorCount = parseInt(errorRate?.errors || "0", 10);

  if (rate >= ALERT_THRESHOLDS.errors.errorRateCritical) {
    alerts.push({
      id: "error-rate-critical",
      severity: "critical",
      category: "errors",
      title: "Critical Error Rate",
      message: `Error rate is ${rate.toFixed(1)}% in the last hour (${errorCount} errors).`,
      value: rate,
      threshold: ALERT_THRESHOLDS.errors.errorRateCritical,
      detectedAt: now,
    });
  } else if (rate >= ALERT_THRESHOLDS.errors.errorRateWarning) {
    alerts.push({
      id: "error-rate-warning",
      severity: "warning",
      category: "errors",
      title: "Elevated Error Rate",
      message: `Error rate is ${rate.toFixed(1)}% in the last hour (${errorCount} errors).`,
      value: rate,
      threshold: ALERT_THRESHOLDS.errors.errorRateWarning,
      detectedAt: now,
    });
  }

  // Critical errors count
  const [criticalErrors] = await query<{ count: string }>(`
    SELECT count() AS count
    FROM errors
    WHERE timestamp >= now() - INTERVAL 1 HOUR AND severity = 'critical'
  `);

  const criticalCount = parseInt(criticalErrors?.count || "0", 10);

  if (criticalCount >= ALERT_THRESHOLDS.errors.criticalErrorsCritical) {
    alerts.push({
      id: "critical-errors-critical",
      severity: "critical",
      category: "errors",
      title: "Multiple Critical Errors",
      message: `${criticalCount} critical errors in the last hour. Immediate attention required.`,
      value: criticalCount,
      threshold: ALERT_THRESHOLDS.errors.criticalErrorsCritical,
      detectedAt: now,
    });
  } else if (criticalCount >= ALERT_THRESHOLDS.errors.criticalErrorsWarning) {
    alerts.push({
      id: "critical-errors-warning",
      severity: "warning",
      category: "errors",
      title: "Critical Errors Detected",
      message: `${criticalCount} critical errors in the last hour.`,
      value: criticalCount,
      threshold: ALERT_THRESHOLDS.errors.criticalErrorsWarning,
      detectedAt: now,
    });
  }

  // Unique error types spike
  const [uniqueTypes] = await query<{ count: string }>(`
    SELECT uniq(error_type) AS count
    FROM errors
    WHERE timestamp >= now() - INTERVAL 1 HOUR
  `);

  const uniqueCount = parseInt(uniqueTypes?.count || "0", 10);

  if (uniqueCount >= ALERT_THRESHOLDS.errors.uniqueErrorTypesWarning) {
    alerts.push({
      id: "error-types-spike",
      severity: "warning",
      category: "errors",
      title: "Many Error Types",
      message: `${uniqueCount} different error types in the last hour. May indicate systemic issues.`,
      value: uniqueCount,
      threshold: ALERT_THRESHOLDS.errors.uniqueErrorTypesWarning,
      detectedAt: now,
    });
  }

  return alerts;
}

/**
 * Check performance alerts (Core Web Vitals)
 */
async function checkPerformanceAlerts(): Promise<Alert[]> {
  const alerts: Alert[] = [];
  const now = new Date().toISOString();

  const [metrics] = await query<{
    p75_lcp: string;
    p75_cls: string;
    p75_inp: string;
    sample_count: string;
  }>(`
    SELECT 
      quantile(0.75)(lcp) AS p75_lcp,
      quantile(0.75)(cls) AS p75_cls,
      quantile(0.75)(inp) AS p75_inp,
      count() AS sample_count
    FROM performance
    WHERE timestamp >= now() - INTERVAL 1 HOUR
  `);

  const sampleCount = parseInt(metrics?.sample_count || "0", 10);

  // Only alert if we have enough samples
  if (sampleCount < 10) {
    return alerts;
  }

  const p75Lcp = parseFloat(metrics?.p75_lcp || "0");
  const p75Cls = parseFloat(metrics?.p75_cls || "0");
  const p75Inp = metrics?.p75_inp ? parseFloat(metrics.p75_inp) : null;

  // LCP checks
  if (p75Lcp >= ALERT_THRESHOLDS.performance.lcpCritical) {
    alerts.push({
      id: "lcp-critical",
      severity: "critical",
      category: "performance",
      title: "Critical LCP",
      message: `P75 LCP is ${(p75Lcp / 1000).toFixed(2)}s (threshold: ${ALERT_THRESHOLDS.performance.lcpCritical / 1000}s).`,
      value: p75Lcp,
      threshold: ALERT_THRESHOLDS.performance.lcpCritical,
      detectedAt: now,
    });
  } else if (p75Lcp >= ALERT_THRESHOLDS.performance.lcpWarning) {
    alerts.push({
      id: "lcp-warning",
      severity: "warning",
      category: "performance",
      title: "Slow LCP",
      message: `P75 LCP is ${(p75Lcp / 1000).toFixed(2)}s (threshold: ${ALERT_THRESHOLDS.performance.lcpWarning / 1000}s).`,
      value: p75Lcp,
      threshold: ALERT_THRESHOLDS.performance.lcpWarning,
      detectedAt: now,
    });
  }

  // CLS checks
  if (p75Cls >= ALERT_THRESHOLDS.performance.clsCritical) {
    alerts.push({
      id: "cls-critical",
      severity: "critical",
      category: "performance",
      title: "Critical CLS",
      message: `P75 CLS is ${p75Cls.toFixed(3)} (threshold: ${ALERT_THRESHOLDS.performance.clsCritical}).`,
      value: p75Cls,
      threshold: ALERT_THRESHOLDS.performance.clsCritical,
      detectedAt: now,
    });
  } else if (p75Cls >= ALERT_THRESHOLDS.performance.clsWarning) {
    alerts.push({
      id: "cls-warning",
      severity: "warning",
      category: "performance",
      title: "Layout Shift Issues",
      message: `P75 CLS is ${p75Cls.toFixed(3)} (threshold: ${ALERT_THRESHOLDS.performance.clsWarning}).`,
      value: p75Cls,
      threshold: ALERT_THRESHOLDS.performance.clsWarning,
      detectedAt: now,
    });
  }

  // INP checks
  if (p75Inp !== null) {
    if (p75Inp >= ALERT_THRESHOLDS.performance.inpCritical) {
      alerts.push({
        id: "inp-critical",
        severity: "critical",
        category: "performance",
        title: "Critical INP",
        message: `P75 INP is ${p75Inp.toFixed(0)}ms (threshold: ${ALERT_THRESHOLDS.performance.inpCritical}ms).`,
        value: p75Inp,
        threshold: ALERT_THRESHOLDS.performance.inpCritical,
        detectedAt: now,
      });
    } else if (p75Inp >= ALERT_THRESHOLDS.performance.inpWarning) {
      alerts.push({
        id: "inp-warning",
        severity: "warning",
        category: "performance",
        title: "Slow Interactions",
        message: `P75 INP is ${p75Inp.toFixed(0)}ms (threshold: ${ALERT_THRESHOLDS.performance.inpWarning}ms).`,
        value: p75Inp,
        threshold: ALERT_THRESHOLDS.performance.inpWarning,
        detectedAt: now,
      });
    }
  }

  return alerts;
}

/**
 * Check cache performance alerts
 */
async function checkCacheAlerts(): Promise<Alert[]> {
  const alerts: Alert[] = [];
  const now = new Date().toISOString();

  // Get latest cache metrics
  const [metrics] = await query<{
    l1_hit_rate: string;
    l2_hit_rate: string;
    fetch_errors: string;
  }>(`
    SELECT 
      l1_hit_rate,
      l2_hit_rate,
      fetch_errors
    FROM cache_metrics
    ORDER BY timestamp DESC
    LIMIT 1
  `);

  if (!metrics) {
    return alerts;
  }

  const l1HitRate = parseFloat(metrics.l1_hit_rate) * 100;
  const l2HitRate = parseFloat(metrics.l2_hit_rate) * 100;
  const fetchErrors = parseInt(metrics.fetch_errors, 10);

  // L1 hit rate checks
  if (l1HitRate <= ALERT_THRESHOLDS.cache.l1HitRateCritical) {
    alerts.push({
      id: "l1-hit-rate-critical",
      severity: "critical",
      category: "cache",
      title: "Critical L1 Cache",
      message: `L1 hit rate is ${l1HitRate.toFixed(1)}% (threshold: ${ALERT_THRESHOLDS.cache.l1HitRateCritical}%).`,
      value: l1HitRate,
      threshold: ALERT_THRESHOLDS.cache.l1HitRateCritical,
      detectedAt: now,
    });
  } else if (l1HitRate <= ALERT_THRESHOLDS.cache.l1HitRateWarning) {
    alerts.push({
      id: "l1-hit-rate-warning",
      severity: "warning",
      category: "cache",
      title: "Low L1 Cache Hit Rate",
      message: `L1 hit rate is ${l1HitRate.toFixed(1)}% (threshold: ${ALERT_THRESHOLDS.cache.l1HitRateWarning}%).`,
      value: l1HitRate,
      threshold: ALERT_THRESHOLDS.cache.l1HitRateWarning,
      detectedAt: now,
    });
  }

  // L2 hit rate checks
  if (l2HitRate <= ALERT_THRESHOLDS.cache.l2HitRateCritical) {
    alerts.push({
      id: "l2-hit-rate-critical",
      severity: "critical",
      category: "cache",
      title: "Critical L2 Cache",
      message: `L2 hit rate is ${l2HitRate.toFixed(1)}% (threshold: ${ALERT_THRESHOLDS.cache.l2HitRateCritical}%).`,
      value: l2HitRate,
      threshold: ALERT_THRESHOLDS.cache.l2HitRateCritical,
      detectedAt: now,
    });
  } else if (l2HitRate <= ALERT_THRESHOLDS.cache.l2HitRateWarning) {
    alerts.push({
      id: "l2-hit-rate-warning",
      severity: "warning",
      category: "cache",
      title: "Low L2 Cache Hit Rate",
      message: `L2 hit rate is ${l2HitRate.toFixed(1)}% (threshold: ${ALERT_THRESHOLDS.cache.l2HitRateWarning}%).`,
      value: l2HitRate,
      threshold: ALERT_THRESHOLDS.cache.l2HitRateWarning,
      detectedAt: now,
    });
  }

  // Fetch errors check
  if (fetchErrors >= ALERT_THRESHOLDS.cache.fetchErrorsCritical) {
    alerts.push({
      id: "fetch-errors-critical",
      severity: "critical",
      category: "cache",
      title: "Many Fetch Errors",
      message: `${fetchErrors} fetch errors detected. External APIs may be failing.`,
      value: fetchErrors,
      threshold: ALERT_THRESHOLDS.cache.fetchErrorsCritical,
      detectedAt: now,
    });
  } else if (fetchErrors >= ALERT_THRESHOLDS.cache.fetchErrorsWarning) {
    alerts.push({
      id: "fetch-errors-warning",
      severity: "warning",
      category: "cache",
      title: "Fetch Errors Detected",
      message: `${fetchErrors} fetch errors detected.`,
      value: fetchErrors,
      threshold: ALERT_THRESHOLDS.cache.fetchErrorsWarning,
      detectedAt: now,
    });
  }

  return alerts;
}

/**
 * Check traffic anomaly alerts
 */
async function checkTrafficAlerts(): Promise<Alert[]> {
  const alerts: Alert[] = [];
  const now = new Date().toISOString();

  // Traffic drop check
  const [todayTraffic] = await query<{ count: string }>(`
    SELECT count() AS count
    FROM page_views
    WHERE timestamp >= today() AND is_bot = 0
  `);

  const [avgTraffic] = await query<{ avg_count: string }>(`
    SELECT avg(daily_count) AS avg_count
    FROM (
      SELECT toDate(timestamp) AS date, count() AS daily_count
      FROM page_views
      WHERE timestamp >= today() - INTERVAL 7 DAY 
        AND timestamp < today()
        AND is_bot = 0
      GROUP BY date
    )
  `);

  const todayCount = parseInt(todayTraffic?.count || "0", 10);
  const avgCount = parseFloat(avgTraffic?.avg_count || "0");

  // Calculate expected traffic based on time of day
  const hoursElapsed = new Date().getHours() + new Date().getMinutes() / 60;
  const expectedSoFar = avgCount * (hoursElapsed / 24);

  if (expectedSoFar > 100 && todayCount < expectedSoFar * ALERT_THRESHOLDS.traffic.trafficDropMultiplier) {
    alerts.push({
      id: "traffic-drop",
      severity: "warning",
      category: "traffic",
      title: "Traffic Drop",
      message: `Today's traffic (${todayCount}) is significantly below expected (${Math.round(expectedSoFar)}).`,
      value: todayCount,
      threshold: `${Math.round(expectedSoFar)}`,
      detectedAt: now,
    });
  }

  // Bot traffic percentage
  const [botRatio] = await query<{ bot_rate: string }>(`
    SELECT 
      countIf(is_bot = 1) / count() * 100 AS bot_rate
    FROM page_views
    WHERE timestamp >= now() - INTERVAL 1 HOUR
  `);

  const botRate = parseFloat(botRatio?.bot_rate || "0");

  if (botRate >= ALERT_THRESHOLDS.traffic.botTrafficCritical) {
    alerts.push({
      id: "bot-traffic-critical",
      severity: "critical",
      category: "traffic",
      title: "Excessive Bot Traffic",
      message: `${botRate.toFixed(1)}% of traffic in the last hour is from bots.`,
      value: botRate,
      threshold: ALERT_THRESHOLDS.traffic.botTrafficCritical,
      detectedAt: now,
    });
  } else if (botRate >= ALERT_THRESHOLDS.traffic.botTrafficWarning) {
    alerts.push({
      id: "bot-traffic-warning",
      severity: "warning",
      category: "traffic",
      title: "High Bot Traffic",
      message: `${botRate.toFixed(1)}% of traffic in the last hour is from bots.`,
      value: botRate,
      threshold: ALERT_THRESHOLDS.traffic.botTrafficWarning,
      detectedAt: now,
    });
  }

  return alerts;
}

// =============================================================================
// Export Alert Category Icons/Colors (for UI)
// =============================================================================

export const ALERT_CATEGORY_META: Record<AlertCategory, { icon: string; color: string }> = {
  ai: { icon: "Bot", color: "purple" },
  errors: { icon: "AlertTriangle", color: "red" },
  performance: { icon: "Gauge", color: "blue" },
  traffic: { icon: "TrendingDown", color: "orange" },
  cache: { icon: "Database", color: "green" },
};

export const ALERT_SEVERITY_META: Record<AlertSeverity, { icon: string; color: string; bgColor: string }> = {
  critical: { icon: "AlertCircle", color: "text-red-500", bgColor: "bg-red-500/10" },
  warning: { icon: "AlertTriangle", color: "text-amber-500", bgColor: "bg-amber-500/10" },
  info: { icon: "Info", color: "text-blue-500", bgColor: "bg-blue-500/10" },
};


