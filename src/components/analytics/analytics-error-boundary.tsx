"use client";

/**
 * AnalyticsErrorBoundary
 *
 * Error boundary that tracks client-side errors to the analytics API.
 * Wraps React's error boundary pattern with analytics integration.
 *
 * Features:
 * - Catches React render errors
 * - Reports to analytics API
 * - Shows fallback UI
 * - Auto-recovers on navigation
 */

import React, { Component, type ReactNode } from "react";
// Import only from client-safe modules (avoid context.ts which imports server-only auth)
import type { ErrorSource, ErrorSeverity } from "@/lib/analytics/types";

// =============================================================================
// Types
// =============================================================================

interface ErrorData {
  event_type: "error";
  error_source: ErrorSource;
  error_type: string;
  error_message: string;
  error_stack: string | null;
  route: string | null;
  component: string | null;
  context: Record<string, unknown>;
  severity: ErrorSeverity;
}

interface Props {
  children: ReactNode;
  /** Fallback UI to show on error */
  fallback?: ReactNode;
  /** Component name for error tracking */
  componentName?: string;
  /** Error severity */
  severity?: ErrorSeverity;
  /** Called when an error occurs */
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

// =============================================================================
// Helpers
// =============================================================================

/**
 * Get the current route path
 */
function getCurrentRoute(): string | null {
  if (typeof window === "undefined") return null;
  return window.location.pathname;
}

/**
 * Classify error type from error object
 */
function getErrorType(error: Error): string {
  // Check for common error types
  if (error.name && error.name !== "Error") {
    return error.name;
  }

  // Try to infer from message
  const message = error.message.toLowerCase();

  if (
    message.includes("network") ||
    message.includes("fetch") ||
    message.includes("failed to fetch")
  ) {
    return "NetworkError";
  }

  if (message.includes("timeout") || message.includes("timed out")) {
    return "TimeoutError";
  }

  if (message.includes("chunk") || message.includes("loading")) {
    return "ChunkLoadError";
  }

  if (
    message.includes("hydration") ||
    message.includes("mismatch") ||
    message.includes("text content does not match")
  ) {
    return "HydrationError";
  }

  return "RenderError";
}

/**
 * Determine error severity from error type
 */
function inferSeverity(errorType: string): ErrorSeverity {
  const highSeverity = ["RenderError", "HydrationError"];
  const lowSeverity = ["ChunkLoadError", "NetworkError"];

  if (highSeverity.includes(errorType)) return "high";
  if (lowSeverity.includes(errorType)) return "low";
  return "medium";
}

/**
 * Send error to analytics API
 */
async function sendError(data: ErrorData): Promise<void> {
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
    // Silently fail - we don't want error tracking to cause more errors
  }
}

// =============================================================================
// Default Fallback UI
// =============================================================================

function DefaultFallback() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[200px] p-8 text-center">
      <div className="text-4xl mb-4">😕</div>
      <h2 className="text-lg font-semibold mb-2">Something went wrong</h2>
      <p className="text-muted-foreground mb-4">
        We&apos;re sorry, but something unexpected happened.
      </p>
      <button
        onClick={() => window.location.reload()}
        className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
      >
        Reload Page
      </button>
    </div>
  );
}

// =============================================================================
// Error Boundary Component
// =============================================================================

export class AnalyticsErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    const { componentName, severity, onError } = this.props;

    // Determine error type and severity
    const errorType = getErrorType(error);
    const errorSeverity = severity || inferSeverity(errorType);

    // Build error data
    const errorData: ErrorData = {
      event_type: "error",
      error_source: "render",
      error_type: errorType,
      error_message: error.message,
      error_stack: error.stack?.slice(0, 2000) || null,
      route: getCurrentRoute(),
      component: componentName || errorInfo.componentStack?.split("\n")[1]?.trim() || null,
      context: {
        componentStack: errorInfo.componentStack?.slice(0, 1000),
      },
      severity: errorSeverity,
    };

    // Send to analytics
    sendError(errorData);

    // Call optional error handler
    onError?.(error, errorInfo);

    // Log to console in development
    if (process.env.NODE_ENV === "development") {
      console.error("[AnalyticsErrorBoundary] Caught error:", error);
      console.error("[AnalyticsErrorBoundary] Error info:", errorInfo);
    }
  }

  render(): ReactNode {
    if (this.state.hasError) {
      return this.props.fallback || <DefaultFallback />;
    }

    return this.props.children;
  }
}

// =============================================================================
// Global Error Handler Setup
// =============================================================================

/**
 * Initialize global error handlers for client-side errors
 * Call this once in your app (e.g., in a useEffect in root layout)
 */
export function initGlobalErrorTracking(): () => void {
  if (typeof window === "undefined") return () => {};

  const handleError = (event: ErrorEvent) => {
    const errorData: ErrorData = {
      event_type: "error",
      error_source: "client",
      error_type: event.error?.name || "UncaughtError",
      error_message: event.message,
      error_stack: event.error?.stack?.slice(0, 2000) || null,
      route: getCurrentRoute(),
      component: null,
      context: {
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno,
      },
      severity: "high",
    };

    sendError(errorData);
  };

  const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
    const error = event.reason;
    const errorData: ErrorData = {
      event_type: "error",
      error_source: "client",
      error_type: error?.name || "UnhandledRejection",
      error_message:
        error?.message || (typeof error === "string" ? error : "Unknown error"),
      error_stack: error?.stack?.slice(0, 2000) || null,
      route: getCurrentRoute(),
      component: null,
      context: {},
      severity: "medium",
    };

    sendError(errorData);
  };

  window.addEventListener("error", handleError);
  window.addEventListener("unhandledrejection", handleUnhandledRejection);

  // Return cleanup function
  return () => {
    window.removeEventListener("error", handleError);
    window.removeEventListener("unhandledrejection", handleUnhandledRejection);
  };
}

