"use client";

/**
 * Global Error Boundary
 *
 * Catches errors that occur in the root layout or errors that bubble up
 * from route segments. This is the last line of defense.
 *
 * Note: This must be a client component and must include its own <html> and <body>
 * tags because it replaces the root layout when an error occurs.
 */

import { useEffect } from "react";
import { AlertTriangle, RefreshCw, Home } from "lucide-react";

interface GlobalErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function GlobalError({ error, reset }: GlobalErrorProps) {
  useEffect(() => {
    // Log to console for debugging
    console.error("[GlobalError] Caught error:", error);

    // Track error to analytics (fire-and-forget)
    fetch("/api/analytics/ingest", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        event_type: "error",
        error_source: "server",
        error_type: "GlobalError",
        error_message: error.message,
        error_stack: error.stack?.slice(0, 2000) || null,
        route: typeof window !== "undefined" ? window.location.pathname : null,
        component: "global-error",
        context: { digest: error.digest },
        severity: "critical",
      }),
      keepalive: true,
    }).catch(() => {
      // Silently fail - don't cause more errors
    });
  }, [error]);

  return (
    <html lang="en">
      <body className="min-h-screen bg-black text-white antialiased">
        <div className="min-h-screen flex items-center justify-center px-4 py-16">
          <div className="w-full max-w-md text-center">
            {/* Error icon */}
            <div className="flex justify-center mb-6">
              <div className="p-4 rounded-full bg-red-500/10">
                <AlertTriangle className="h-12 w-12 text-red-500" />
              </div>
            </div>

            {/* Error message */}
            <h1 className="text-2xl font-bold mb-3">Something went wrong</h1>
            <p className="text-zinc-400 mb-6">
              We&apos;re sorry, but something unexpected happened. Please try again.
            </p>

            {/* Error digest for support */}
            {error.digest && (
              <div className="mb-6 p-3 rounded-lg bg-zinc-900 text-xs text-zinc-500 font-mono">
                Error ID: {error.digest}
              </div>
            )}

            {/* Action buttons */}
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <button
                onClick={reset}
                className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-white text-black font-medium rounded-lg hover:bg-zinc-200 transition-colors"
                data-testid="error-retry-button"
              >
                <RefreshCw className="h-4 w-4" />
                Try again
              </button>
              <a
                href="/"
                className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-zinc-800 text-white font-medium rounded-lg hover:bg-zinc-700 transition-colors"
                data-testid="error-home-button"
              >
                <Home className="h-4 w-4" />
                Go home
              </a>
            </div>

            {/* Help text */}
            <p className="mt-8 text-xs text-zinc-500">
              If this problem persists, please contact support.
            </p>
          </div>
        </div>
      </body>
    </html>
  );
}
