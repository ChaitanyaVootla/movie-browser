/**
 * Regression test: the details-page videos section must mount EXACTLY ONE
 * YouTube player.
 *
 * BUG (reported Aug 18 2026): clicking play in the videos section produced
 * DOUBLE AUDIO, and pausing the visible player left a copy still playing.
 * Cause: the desktop layout (`hidden md:flex`) and the mobile layout
 * (`md:hidden`) each rendered their own <iframe> with the SAME src, and both
 * were permanently in the DOM — Tailwind `hidden` is `display:none`, which does
 * NOT unload an iframe or stop its audio. With `isPlaying` true both srcs got
 * `&autoplay=1`, so two YouTube players ran: one visible, one invisible.
 * Confirmed on prod HTML, which contained 2 iframes for the same video key.
 *
 * Fix: gate each iframe on `useMobile()` (same 768px `md` breakpoint) so only
 * the visible layout mounts a player.
 */
import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/hooks/use-analytics", () => ({
  useAnalytics: () => ({ trackAction: vi.fn(), trackTrailerPlay: vi.fn() }),
}));
vi.mock("@/hooks/use-wake-lock", () => ({
  useWakeLock: () => ({ isActive: false, request: vi.fn(), release: vi.fn() }),
}));

// The gallery fetches /api/youtube for batch video metadata on mount; an
// unstubbed fetch leaves happy-dom async tasks running past teardown.
beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({ videos: {} }) }))
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const isMobileMock = vi.fn(() => false);
vi.mock("@/hooks/use-mobile", () => ({ useMobile: () => isMobileMock() }));

const VIDEOS = [
  { key: "abc123", name: "Official Trailer", site: "YouTube", type: "Trailer", official: true },
  { key: "def456", name: "Teaser", site: "YouTube", type: "Teaser", official: true },
];

function embedFrames(): HTMLIFrameElement[] {
  return Array.from(document.querySelectorAll("iframe")).filter((f) =>
    (f.getAttribute("src") ?? "").includes("youtube-nocookie.com/embed/")
  );
}

async function renderGallery() {
  const { VideoGallery } = await import("./video-gallery");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  render(<VideoGallery videos={VIDEOS as any} />);
}

describe("VideoGallery — exactly one YouTube player", () => {
  it("mounts ONE embed iframe on desktop (not one per responsive layout)", async () => {
    isMobileMock.mockReturnValue(false);
    await renderGallery();
    expect(embedFrames()).toHaveLength(1);
  });

  it("mounts ONE embed iframe on mobile", async () => {
    isMobileMock.mockReturnValue(true);
    await renderGallery();
    expect(embedFrames()).toHaveLength(1);
  });

  it("never mounts two players for the SAME video key (the double-audio bug)", async () => {
    isMobileMock.mockReturnValue(false);
    await renderGallery();
    const keys = embedFrames().map(
      (f) => (f.getAttribute("src") ?? "").match(/embed\/([A-Za-z0-9_-]+)/)?.[1]
    );
    expect(new Set(keys).size).toBe(keys.length);
  });
});
