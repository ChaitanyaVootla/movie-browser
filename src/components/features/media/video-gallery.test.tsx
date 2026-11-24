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
 * a player. Since Nov 2026 the gallery is ONE responsive layout (no twin
 * blocks at all), so there is a single player slot by construction.
 *
 * BUG 2 (perf audit Oct 2026): every detail-page view eagerly loaded the
 * YouTube player (base.js + ytembeds, ~2.5MB decoded JS) far below the fold —
 * and TWICE on mobile, because `useMobile()` is false on the server / first
 * render, so the desktop iframe was SSR'd and began loading before the effect
 * swapped in the mobile one (prod Inception mobile: 2x base.js, 10.3MB decoded
 * JS, TBT 1.7s). Fix: a thumbnail click-to-play facade; the iframe mounts only
 * on play, by which point the layout is known.
 */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
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
  // One responsive layout = one facade (asserted below).
  fireEvent.click(screen.getByRole("button", { name: "Play Official Trailer" }));
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

/**
 * One thumbnail list, not two: the strip used to be rendered in BOTH a
 * `hidden md:flex` desktop block and an `md:hidden` mobile block — every tile
 * (and its image request) twice in the DOM.
 */
describe("VideoGallery — single responsive layout", () => {
  it.each([
    ["desktop", false],
    ["mobile", true],
  ])("renders each thumbnail and the player facade exactly once (%s)", async (_label, mobile) => {
    isMobileMock.mockReturnValue(mobile);
    await renderGallery();
    for (const key of ["abc123", "def456"]) {
      expect(document.querySelectorAll(`img[src*="img.youtube.com/vi/${key}/mqdefault.jpg"]`)).toHaveLength(1);
    }
    expect(screen.getAllByRole("button", { name: "Play Official Trailer" })).toHaveLength(1);
    expect(document.querySelectorAll('[data-testid="video-thumbnails"]')).toHaveLength(1);
  });

  it("server-renders one thumbnail list", async () => {
    const { VideoGallery } = await import("./video-gallery");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const html = renderToString(<VideoGallery videos={VIDEOS as any} />);
    expect(html.match(/img\.youtube\.com\/vi\/def456\/mqdefault\.jpg/g)).toHaveLength(1);
  });
});

/** Simulate the browser finishing an image load with a given decoded width. */
function loadImage(img: HTMLImageElement, naturalWidth: number) {
  Object.defineProperty(img, "naturalWidth", { configurable: true, value: naturalWidth });
  // next/image dedupes onLoad per src; clear its marker so this load is handled.
  delete (img as unknown as Record<string, unknown>)["data-loaded-src"];
  fireEvent.load(img);
}

const thumb = (key: string) =>
  document.querySelector<HTMLImageElement>(`img[src*="img.youtube.com/vi/${key}/mqdefault.jpg"]`);

/**
 * A deleted/private YouTube video's thumbnail is a 120×90 grey placeholder
 * served WITHOUT an error, so the old onError-only handling left a blank tile.
 */
describe("VideoGallery — unavailable YouTube videos", () => {
  it("isYouTubePlaceholderThumb: 120px-wide placeholder vs real thumbnails", async () => {
    const { isYouTubePlaceholderThumb } = await import("./video-gallery");
    const img = (w: number) => ({ naturalWidth: w }) as HTMLImageElement;
    expect(isYouTubePlaceholderThumb(img(120))).toBe(true);
    expect(isYouTubePlaceholderThumb(img(320))).toBe(false); // mqdefault
    expect(isYouTubePlaceholderThumb(img(480))).toBe(false); // hqdefault
    expect(isYouTubePlaceholderThumb(img(0))).toBe(false); // not decoded yet
  });

  it("drops a tile whose thumbnail is YouTube's placeholder", async () => {
    await renderGallery();
    loadImage(thumb("def456")!, 120);
    await waitFor(() => expect(thumb("def456")).toBeNull());
    expect(thumb("abc123")).not.toBeNull();
  });

  it("keeps a tile whose thumbnail is real", async () => {
    await renderGallery();
    loadImage(thumb("def456")!, 320);
    // Let next/image's decode() promise settle before asserting.
    await new Promise((r) => setTimeout(r, 0));
    expect(thumb("def456")).not.toBeNull();
  });

  it("drops a tile whose thumbnail fails to load", async () => {
    await renderGallery();
    fireEvent.error(thumb("def456")!);
    await waitFor(() => expect(thumb("def456")).toBeNull());
  });

  it("moves the main player to the next available video when the first is gone", async () => {
    await renderGallery();
    loadImage(thumb("abc123")!, 120);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Play Teaser" })).toBeInTheDocument()
    );
    expect(screen.queryByRole("button", { name: "Play Official Trailer" })).toBeNull();
  });

  it("renders nothing when every video is gone", async () => {
    await renderGallery();
    loadImage(thumb("abc123")!, 120);
    await waitFor(() => expect(thumb("abc123")).toBeNull());
    loadImage(thumb("def456")!, 120);
    await waitFor(() => expect(document.querySelector('[data-testid="video-thumbnails"]')).toBeNull());
  });
});
