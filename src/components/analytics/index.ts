/**
 * Analytics Components
 *
 * Client-side components for tracking page views, performance,
 * and errors. Import and use in your layout or pages.
 *
 * @example
 * ```tsx
 * // In your root layout or providers:
 * import { AnalyticsProvider } from "@/components/analytics";
 *
 * <AnalyticsProvider>
 *   {children}
 * </AnalyticsProvider>
 * ```
 */

export { PageViewTracker } from "./page-view-tracker";
export { WebVitalsTracker } from "./web-vitals-tracker";
export { AnalyticsErrorBoundary, initGlobalErrorTracking } from "./analytics-error-boundary";
export { AnalyticsProvider } from "./analytics-provider";
