/**
 * Regression tests: the details-page videos section must mount AT MOST ONE
 * YouTube player, and none until the viewer presses play.
 *
 * BUG 1 (reported Aug 18 2026): clicking play in the videos section produced
 * DOUBLE AUDIO, and pausing the visible player left a copy still playing.
 * Cause: the desktop layout (`hidden md:flex`) and the mobile layout
 * (`md:hidden`) each rendered their own <iframe> with the SAME src, and both
 * were permanently in the DOM — Tailwind `hidden` is `display:none`, which does
 * NOT unload an iframe or stop its audio. Fix: gate each iframe on
 * `useMobile()` (same 768px `md` breakpoint) so only the visible layout mounts
 * a player.
 *
 * BUG 2 (perf audit Oct 2026): every detail-page view eagerly loaded the
 * YouTube player (base.js + ytembeds, ~2.5MB decoded JS) far below the fold —
 * and TWICE on mobile, because `useMobile()` is false on the server / first
 * render, so the desktop iframe was SSR'd and began loading before the effect
 * swapped in the mobile one (prod Inception mobile: 2x base.js, 10.3MB decoded
 * JS, TBT 1.7s). Fix: a thumbnail click-to-play facade; the iframe mounts only
 * on play, by which point the layout is known.
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const trackTrailerPlay = vi.fn();
vi.mock("@/hooks/use-analytics", () => ({
  useAnalytics: () => ({ trackAction: vi.fn(), trackTrailerPlay }),
}));
vi.mock("@/hooks/use-wake-lock", () => ({
  useWakeLock: () => ({ isActive: false, request: vi.fn(), release: vi.fn() }),
}));

// The gallery fetches /api/youtube for batch video metadata on mount; an
// unstubbed fetch leaves happy-dom async tasks running past teardown.
beforeEach(() => {
  trackTrailerPlay.mockClear();
  // happy-dom would otherwise REALLY fetch the embed URL of a mounted iframe
  // (network call to YouTube from a unit test). Answer it locally instead.
  const happyDOM = (
    window as unknown as {
      happyDOM?: {
        settings: {
          fetch: { interceptor: { beforeAsyncRequest: () => Promise<Response> } | null };
        };
      };
    }
  ).happyDOM;
  if (happyDOM) {
    happyDOM.settings.fetch.interceptor = {
      beforeAsyncRequest: async () => new window.Response("", { status: 204 }),
    };
  }
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
  render(<VideoGallery videos={VIDEOS as any} mediaId={27205} mediaType="movie" />);
}

/** Press the facade's play button in whichever layout is visible. */
function pressPlay() {
  // Both responsive layouts render a (stateless) facade; either starts playback.
  fireEvent.click(screen.getAllByRole("button", { name: "Play Official Trailer" })[0]);
}

describe("VideoGallery — no player until play", () => {
  it("server-renders NO iframe (the desktop one used to SSR and start loading)", async () => {
    isMobileMock.mockReturnValue(false);
    const { VideoGallery } = await import("./video-gallery");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const html = renderToString(<VideoGallery videos={VIDEOS as any} />);
    expect(html).not.toContain("<iframe");
    expect(html).toContain("i.ytimg.com/vi/abc123/hqdefault.jpg");
  });

  it.each([
    ["desktop", false],
    ["mobile", true],
  ])("mounts no iframe on first render (%s)", async (_label, mobile) => {
    isMobileMock.mockReturnValue(mobile);
    await renderGallery();
    expect(embedFrames()).toHaveLength(0);
  });
});

describe("VideoGallery — exactly one YouTube player once playing", () => {
  it.each([
    ["desktop", false],
    ["mobile", true],
  ])("mounts ONE autoplaying, lazy, nocookie embed after play (%s)", async (_label, mobile) => {
    isMobileMock.mockReturnValue(mobile);
    await renderGallery();
    pressPlay();

    const frames = embedFrames();
    expect(frames).toHaveLength(1);
    const src = frames[0].getAttribute("src") ?? "";
    expect(src).toContain("youtube-nocookie.com/embed/abc123");
    expect(src).toContain("autoplay=1");
    expect(frames[0].getAttribute("loading")).toBe("lazy");
    expect(trackTrailerPlay).toHaveBeenCalledWith(27205, "movie", "Official Trailer");
  });

  it("never mounts two players for the SAME video key (the double-audio bug)", async () => {
    isMobileMock.mockReturnValue(false);
    await renderGallery();
    pressPlay();
    const keys = embedFrames().map(
      (f) => (f.getAttribute("src") ?? "").match(/embed\/([A-Za-z0-9_-]+)/)?.[1]
    );
    expect(keys.length).toBeGreaterThan(0);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
