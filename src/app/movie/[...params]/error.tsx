"use client";

/**
 * Movie Page Error Boundary
 *
 * Catches errors that occur when loading/rendering a movie page.
 * Shows a graceful fallback UI instead of a blank page.
 */

import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle, RefreshCw, Home, Search } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function MovieError({ error, reset }: ErrorProps) {
  useEffect(() => {
    // Log to console for debugging
    console.error("[MovieError] Caught error:", error);

    // Track error to analytics (fire-and-forget)
    fetch("/api/analytics/ingest", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        event_type: "error",
        error_source: "server",
        error_type: "MoviePageError",
        error_message: error.message,
        error_stack: error.stack?.slice(0, 2000) || null,
        route: typeof window !== "undefined" ? window.location.pathname : null,
        component: "movie-page",
        context: { digest: error.digest },
        severity: "high",
      }),
      keepalive: true,
    }).catch(() => {
      // Silently fail
    });
  }, [error]);

  return (
    <div
      className="min-h-[70vh] flex items-center justify-center px-4 py-16"
      data-testid="error-boundary"
    >
      <div className="w-full max-w-md text-center">
        {/* Error icon */}
        <div className="flex justify-center mb-6">
          <div className="p-4 rounded-full bg-red-500/10">
            <AlertTriangle className="h-10 w-10 text-red-500" />
          </div>
        </div>

        {/* Error message */}
        <h1 className="text-xl font-bold mb-2">Couldn&apos;t load movie</h1>
        <p className="text-muted-foreground mb-6">
          We had trouble loading this movie. It might be temporarily unavailable.
        </p>

        {/* Error digest for support */}
        {error.digest && (
          <div className="mb-6 p-3 rounded-lg bg-muted text-xs text-muted-foreground font-mono">
            Error ID: {error.digest}
          </div>
        )}

        {/* Action buttons */}
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Button onClick={reset} data-testid="error-retry-button">
            <RefreshCw className="h-4 w-4 mr-2" />
            Try again
          </Button>
          <Button variant="outline" asChild>
            <Link href="/" data-testid="error-home-button">
              <Home className="h-4 w-4 mr-2" />
              Go home
            </Link>
          </Button>
        </div>

        {/* Alternative action */}
        <div className="mt-6 pt-6 border-t border-border">
          <p className="text-sm text-muted-foreground mb-3">
            Looking for something else?
          </p>
          <Button variant="ghost" size="sm" asChild>
            <Link href="/browse">
              <Search className="h-4 w-4 mr-2" />
              Browse movies
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
