/**
 * BUG pinned here (review Oct 9 2026): a failed lazy chunk load (offline, a
 * stale build after a deploy) threw during render. The nearest boundary
 * wrapped the WHOLE app, so one hover blanked the page, and `loader ??=`
 * cached the rejected promise, so the preview could never load again until a
 * full reload.
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const chunk = vi.hoisted(() => ({ failuresLeft: 0, imports: 0 }));
vi.mock("./preview-body", () => {
  chunk.imports++;
  if (chunk.failuresLeft > 0) {
    chunk.failuresLeft--;
    throw new Error("Failed to load chunk /_next/static/chunks/preview-body.js");
  }
  return { PreviewBody: () => <p>preview body loaded</p> };
});

import { LazyPreviewBody, PreviewChunkBoundary, resetPreviewBodyLoader } from "./lazy-preview-body";

const ITEM = {
  id: 9,
  title: "Heat",
  poster_path: null,
  backdrop_path: null,
  vote_average: 0,
  vote_count: 0,
  popularity: 0,
  adult: false,
  release_date: "1995-12-15",
  overview: "",
  genre_ids: [],
};

const props = {
  item: ITEM,
  state: { status: "loading" as const },
  onRetry: () => {},
  variant: "popover" as const,
  titleId: "t",
};

afterEach(() => {
  cleanup();
  resetPreviewBodyLoader();
  vi.resetModules();
});

describe("LazyPreviewBody chunk failure", () => {
  it("contains the failure to the preview and recovers on Retry", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    // The boundary reports via AnalyticsErrorBoundary; keep that off the network.
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve(new Response(null, { status: 204 })))
    );
    chunk.failuresLeft = 1;
    const onClose = vi.fn();

    render(
      <div>
        <p>rest of the app</p>
        <PreviewChunkBoundary item={ITEM} onClose={onClose}>
          <LazyPreviewBody {...props} />
        </PreviewChunkBoundary>
      </div>
    );

    expect(await screen.findByText("Couldn’t load the preview.")).toBeInTheDocument();
    // The rest of the page is untouched (the old failure blanked the app).
    expect(screen.getByText("rest of the app")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "View details" })).toHaveAttribute(
      "href",
      "/movie/9/heat"
    );

    fireEvent.click(screen.getByRole("button", { name: /Retry/ }));
    expect(await screen.findByText("preview body loaded")).toBeInTheDocument();
    expect(chunk.imports).toBe(2); // the rejection was not cached
    vi.unstubAllGlobals();
  });
});
