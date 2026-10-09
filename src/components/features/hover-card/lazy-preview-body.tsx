"use client";

import { Fragment, lazy, Suspense, useState, type ComponentProps, type ReactNode } from "react";
import Link from "next/link";
import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AnalyticsErrorBoundary } from "@/components/analytics/analytics-error-boundary";
import { getMediaHref } from "@/lib/utils";
import type { PreviewItem } from "./preview-store";
import type { PreviewBody as PreviewBodyComponent } from "./preview-body";

/**
 * `PreviewBody` (and with it TitleActions → SaveButton/RateButton/QuickLog/
 * LoginDialog/list picker) is loaded on demand. The overlay and drawer are
 * mounted by the ROOT Providers, so a static import would put the whole action
 * stack into the entry JS of every route (performance.md item 15). The card
 * wrapper preloads the chunk at hover-warm time (200ms) or on touch-down, so it
 * is normally ready before the preview opens. The overlay stays hidden until
 * the body has height.
 *
 * Chunk-load FAILURE (offline, a stale build after a deploy) used to throw
 * during render. The nearest boundary wrapped the whole app, so one hover
 * blanked the page, and the rejected import stayed cached so it could never
 * retry. Now:
 * - the loader resets on failure;
 * - each attempt gets a fresh `React.lazy` (React.lazy caches a rejection too);
 * - `PreviewChunkBoundary` contains the failure to the preview, with a Retry.
 */
type PreviewBodyModule = typeof import("./preview-body");
let loader: Promise<PreviewBodyModule> | null = null;

export function preloadPreviewBody(): Promise<PreviewBodyModule> {
  loader ??= import("./preview-body").catch((error: unknown) => {
    loader = null; // let the next hover / Retry fetch the chunk again
    throw error;
  });
  return loader;
}

/** Test seam: forget the cached chunk promise. */
export function resetPreviewBodyLoader(): void {
  loader = null;
}

const makeLazyBody = () =>
  lazy(() => preloadPreviewBody().then((mod) => ({ default: mod.PreviewBody })));

type PreviewBodyProps = ComponentProps<typeof PreviewBodyComponent>;

export function LazyPreviewBody(props: PreviewBodyProps) {
  // One lazy component per mount; PreviewChunkBoundary remounts on Retry.
  const [Body] = useState(makeLazyBody);
  return (
    <Suspense fallback={null}>
      <Body {...props} />
    </Suspense>
  );
}

/**
 * Error boundary local to the preview (hover panel AND quick-info drawer). It
 * reports through AnalyticsErrorBoundary (`errors` table), shows a compact
 * fallback, and on Retry remounts its subtree, which creates a fresh lazy
 * component and re-imports the chunk.
 */
export function PreviewChunkBoundary({
  item,
  onClose,
  children,
}: {
  item: PreviewItem;
  onClose: () => void;
  children: ReactNode;
}) {
  const [attempt, setAttempt] = useState(0);
  return (
    <AnalyticsErrorBoundary
      key={attempt}
      componentName="PreviewBody"
      severity="low"
      fallback={
        <PreviewLoadFailed item={item} onRetry={() => setAttempt((a) => a + 1)} onClose={onClose} />
      }
    >
      <Fragment>{children}</Fragment>
    </AnalyticsErrorBoundary>
  );
}

function PreviewLoadFailed({
  item,
  onRetry,
  onClose,
}: {
  item: PreviewItem;
  onRetry: () => void;
  onClose: () => void;
}) {
  const isMovie = "title" in item;
  const title = isMovie ? item.title : item.name;
  return (
    <div className="space-y-3 p-4" role="status" data-preview-state="chunk-error">
      <p className="text-lg font-semibold text-foreground">{title}</p>
      <p className="text-sm text-muted-foreground">Couldn&rsquo;t load the preview.</p>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" className="gap-1.5" onClick={onRetry}>
          <RotateCcw className="h-3.5 w-3.5" />
          Retry
        </Button>
        <Button asChild size="sm" variant="secondary">
          <Link href={getMediaHref(item.id, isMovie, title)} prefetch={false} onClick={onClose}>
            View details
          </Link>
        </Button>
      </div>
    </div>
  );
}
