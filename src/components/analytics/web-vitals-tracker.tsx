"use client";

/**
 * WebVitalsTracker
 *
 * Tracks Core Web Vitals (LCP, FID, CLS, FCP, TTFB, INP) and reports them
 * to the analytics API. Uses the web-vitals library for accurate measurements.
 *
 * Features:
 * - Tracks all Core Web Vitals
 * - Batches metrics before sending
 * - Respects DNT
 * - Includes connection type info
 */

import { useEffect, useRef, useCallback } from "react";
import { usePathname } from "next/navigation";
import { onLCP, onCLS, onFCP, onTTFB, onINP } from "web-vitals";
import type { Metric } from "web-vitals";
// Import only from client-safe modules (avoid context.ts which imports server-only auth)
import type { PageType } from "@/lib/analytics/types";

/**
 * Detect page type from URL path (duplicated to avoid server-only imports)
 */
function getPageTypeFromPath(path: string): PageType {
  const normalized = path.toLowerCase().split("?")[0];

  if (normalized === "/" || normalized === "") return "home";
  if (normalized.startsWith("/movie/")) return "movie";
  if (normalized.startsWith("/series/")) return "series";
  if (normalized.startsWith("/person/")) return "person";
  if (normalized.startsWith("/browse")) return "browse";
  if (normalized.startsWith("/topics/") && normalized !== "/topics/") return "topic_detail";
  if (normalized === "/topics") return "topics";
  if (normalized.startsWith("/library")) return "library";
  if (normalized.startsWith("/watchlist")) return "watchlist";
  if (normalized.startsWith("/ratings")) return "ratings";
  if (normalized.startsWith("/watched")) return "watched";
  if (normalized.startsWith("/search")) return "search";
  if (normalized.startsWith("/admin")) return "admin";
  return "other";
}

// =============================================================================
// Types
// =============================================================================

interface PerformanceData {
  event_type: "performance";
  path: string;
  page_type: PageType;
  ttfb: number;
  fcp: number;
  lcp: number;
  cls: number;
  inp: number | null;
  resource_count: number;
  total_transfer_size: number;
  connection_type: string | null;
}

interface VitalsState {
  ttfb: number | null;
  fcp: number | null;
  lcp: number | null;
  cls: number | null;
  inp: number | null;
}

// =============================================================================
// Helpers
// =============================================================================

/**
 * Check if Do Not Track is enabled
 */
function isDNTEnabled(): boolean {
  if (typeof navigator === "undefined") return false;
  return navigator.doNotTrack === "1";
}

/**
 * Get connection type from Network Information API
 */
function getConnectionType(): string | null {
  if (typeof navigator === "undefined") return null;

  const nav = navigator as Navigator & {
    connection?: {
      effectiveType?: string;
      type?: string;
    };
  };

  if (nav.connection) {
    return nav.connection.effectiveType || nav.connection.type || null;
  }

  return null;
}

/**
 * Get resource timing info
 */
function getResourceInfo(): { count: number; size: number } {
  if (typeof performance === "undefined") {
    return { count: 0, size: 0 };
  }

  const resources = performance.getEntriesByType("resource") as PerformanceResourceTiming[];

  let totalSize = 0;
  for (const resource of resources) {
    totalSize += resource.transferSize || 0;
  }

  return {
    count: resources.length,
    size: totalSize,
  };
}

/**
 * Send performance data to the ingest API
 */
async function sendPerformanceData(data: PerformanceData): Promise<void> {
  try {
    await fetch("/api/analytics/ingest", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(data),
      keepalive: true,
    });
  } catch {
    // Silently fail - analytics should never break the app
  }
}

// =============================================================================
// Component
// =============================================================================

export function WebVitalsTracker() {
  const pathname = usePathname();
  const vitalsRef = useRef<VitalsState>({
    ttfb: null,
    fcp: null,
    lcp: null,
    cls: null,
    inp: null,
  });
  const sentRef = useRef(false);
  const pathRef = useRef(pathname);

  /**
   * Send collected vitals to API
   */
  const sendVitals = useCallback(() => {
    // Don't send if already sent for this page or if DNT enabled
    if (sentRef.current || isDNTEnabled()) return;

    const vitals = vitalsRef.current;

    // Require at least TTFB, FCP, LCP, and CLS (core metrics)
    if (vitals.ttfb === null || vitals.fcp === null || vitals.lcp === null || vitals.cls === null) {
      return;
    }

    sentRef.current = true;

    const { count, size } = getResourceInfo();

    const data: PerformanceData = {
      event_type: "performance",
      path: pathRef.current,
      page_type: getPageTypeFromPath(pathRef.current),
      ttfb: vitals.ttfb,
      fcp: vitals.fcp,
      lcp: vitals.lcp,
      cls: vitals.cls,
      inp: vitals.inp,
      resource_count: count,
      total_transfer_size: size,
      connection_type: getConnectionType(),
    };

    sendPerformanceData(data);
  }, []);

  /**
   * Handle metric report
   */
  const handleMetric = useCallback(
    (metric: Metric) => {
      const value = Math.round(metric.value * 100) / 100; // Round to 2 decimals

      switch (metric.name) {
        case "TTFB":
          vitalsRef.current.ttfb = value;
          break;
        case "FCP":
          vitalsRef.current.fcp = value;
          break;
        case "LCP":
          vitalsRef.current.lcp = value;
          break;
        case "CLS":
          vitalsRef.current.cls = value;
          break;
        case "INP":
          vitalsRef.current.inp = value;
          break;
      }

      // Try to send after each metric (will only send once all required metrics are collected)
      sendVitals();
    },
    [sendVitals]
  );

  /**
   * Reset on path change
   */
  useEffect(() => {
    // Reset state for new page
    vitalsRef.current = {
      ttfb: null,
      fcp: null,
      lcp: null,
      cls: null,
      inp: null,
    };
    sentRef.current = false;
    pathRef.current = pathname;
  }, [pathname]);

  /**
   * Register web vitals observers
   */
  useEffect(() => {
    // Skip if DNT is enabled
    if (isDNTEnabled()) return;

    // Register all web vitals observers
    // These will call handleMetric when metrics are available
    // Note: FID is deprecated in web-vitals v4+, replaced by INP
    onTTFB(handleMetric);
    onFCP(handleMetric);
    onLCP(handleMetric);
    onCLS(handleMetric);
    onINP(handleMetric);

    // Also try to send on page hide (for CLS which may update late)
    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        sendVitals();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [handleMetric, sendVitals]);

  // This component renders nothing
  return null;
}
