"use client";

/**
 * AnalyticsProvider
 *
 * Combines all analytics tracking components into a single provider.
 * Add this to your root layout to enable:
 * - Page view tracking
 * - Core Web Vitals tracking
 * - Global error tracking
 * - Error boundary (optional)
 *
 * @example
 * ```tsx
 * <AnalyticsProvider>
 *   {children}
 * </AnalyticsProvider>
 * ```
 */

import { useEffect, type ReactNode, Suspense } from "react";
import { PageViewTracker } from "./page-view-tracker";
import { WebVitalsTracker } from "./web-vitals-tracker";
import {
  AnalyticsErrorBoundary,
  initGlobalErrorTracking,
} from "./analytics-error-boundary";

// =============================================================================
// Types
// =============================================================================

interface AnalyticsProviderProps {
  children: ReactNode;
  /**
   * Enable page view tracking
   * @default true
   */
  enablePageViews?: boolean;
  /**
   * Enable Core Web Vitals tracking
   * @default true
   */
  enableWebVitals?: boolean;
  /**
   * Enable global error tracking (window.onerror, unhandledrejection)
   * @default true
   */
  enableErrorTracking?: boolean;
  /**
   * Wrap children in an error boundary
   * @default false
   */
  enableErrorBoundary?: boolean;
  /**
   * Fallback UI for error boundary
   */
  errorFallback?: ReactNode;
}

// =============================================================================
// Component
// =============================================================================

export function AnalyticsProvider({
  children,
  enablePageViews = true,
  enableWebVitals = true,
  enableErrorTracking = true,
  enableErrorBoundary = false,
  errorFallback,
}: AnalyticsProviderProps) {
  /**
   * Initialize global error tracking
   */
  useEffect(() => {
    if (!enableErrorTracking) return;

    const cleanup = initGlobalErrorTracking();
    return cleanup;
  }, [enableErrorTracking]);

  /**
   * Build the content with trackers
   */
  const content = (
    <>
      {/* Page view tracker needs Suspense due to useSearchParams */}
      {enablePageViews && (
        <Suspense fallback={null}>
          <PageViewTracker />
        </Suspense>
      )}
      {enableWebVitals && <WebVitalsTracker />}
      {children}
    </>
  );

  /**
   * Optionally wrap in error boundary
   */
  if (enableErrorBoundary) {
    return (
      <AnalyticsErrorBoundary
        fallback={errorFallback}
        componentName="AnalyticsProvider"
      >
        {content}
      </AnalyticsErrorBoundary>
    );
  }

  return content;
}

