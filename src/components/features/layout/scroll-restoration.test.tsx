import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, act, cleanup } from "@testing-library/react";
import { SCROLL_STORE_KEY } from "@/lib/scroll-restoration";

let mockPathname = "/browse";
vi.mock("next/navigation", () => ({
  usePathname: () => mockPathname,
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn(), back: vi.fn() }),
}));

import { ScrollRestoration, useScrollRestorationGate } from "./scroll-restoration";

let scrollY = 0;
let scrollHeight = 20000;
const scrollToSpy = vi.fn((x: number | ScrollToOptions, y?: number) => {
  const top = typeof x === "number" ? (y ?? 0) : (x.top ?? 0);
  scrollY = Math.max(0, Math.min(top, scrollHeight - window.innerHeight));
});

function setUrl(url: string) {
  window.history.replaceState(null, "", url);
}
function fireScroll(y: number) {
  scrollY = y;
  window.dispatchEvent(new Event("scroll"));
}
function saved(): Record<string, number> {
  return JSON.parse(sessionStorage.getItem(SCROLL_STORE_KEY) ?? "{}") as Record<string, number>;
}
async function frames(ms: number) {
  await act(async () => {
    await new Promise((r) => setTimeout(r, ms));
  });
}

beforeEach(() => {
  sessionStorage.clear();
  scrollY = 0;
  scrollHeight = 20000;
  scrollToSpy.mockClear();
  Object.defineProperty(window, "scrollY", { configurable: true, get: () => scrollY });
  Object.defineProperty(document.documentElement, "scrollHeight", {
    configurable: true,
    get: () => scrollHeight,
  });
  window.scrollTo = scrollToSpy as unknown as typeof window.scrollTo;
  mockPathname = "/browse";
  setUrl("/browse");
});

afterEach(() => cleanup());

describe("ScrollRestoration", () => {
  it("takes over scroll restoration from the browser", () => {
    render(<ScrollRestoration />);
    expect(window.history.scrollRestoration).toBe("manual");
  });

  it("scrolls to top on a forward navigation to a new page (old ScrollToTop behaviour)", () => {
    const { rerender } = render(<ScrollRestoration />);
    fireScroll(900);
    setUrl("/movie/1/x");
    mockPathname = "/movie/1/x";
    rerender(<ScrollRestoration />);
    expect(scrollToSpy).toHaveBeenLastCalledWith(0, 0);
  });

  it("saves the position under the URL you were on when you follow a link", () => {
    render(<ScrollRestoration />);
    fireScroll(1234);
    const a = document.createElement("a");
    a.href = "/movie/1/x";
    document.body.appendChild(a);
    a.addEventListener("click", (e) => e.preventDefault());
    a.click();
    expect(saved()["/browse"]).toBe(1234);
    a.remove();
  });

  it("restores the saved position on Back, after the page commits", async () => {
    const { rerender } = render(<ScrollRestoration />);
    fireScroll(2400);
    // Navigate forward (push) to a detail page.
    window.dispatchEvent(new MouseEvent("click")); // no-op (not a link)
    sessionStorage.setItem(SCROLL_STORE_KEY, JSON.stringify({ "/browse": 2400 }));
    setUrl("/movie/1/x");
    mockPathname = "/movie/1/x";
    rerender(<ScrollRestoration />);
    expect(scrollY).toBe(0);

    // Back: URL changes first, then Next commits the restored route.
    scrollHeight = 1000; // outgoing/short DOM — must not restore into it
    setUrl("/browse");
    window.dispatchEvent(new PopStateEvent("popstate"));
    await frames(50);
    expect(scrollY).toBe(0);

    mockPathname = "/browse";
    scrollHeight = 20000; // cached list re-rendered at full height
    rerender(<ScrollRestoration />);
    await frames(120);
    expect(scrollY).toBe(2400);
  });

  it("ignores a same-URL popstate (useHistoryDismiss overlay entries)", async () => {
    render(<ScrollRestoration />);
    fireScroll(800);
    scrollToSpy.mockClear();
    window.dispatchEvent(new PopStateEvent("popstate"));
    await frames(80);
    expect(scrollToSpy).not.toHaveBeenCalled();
    expect(scrollY).toBe(800);
  });

  it("restores immediately on a same-page search change (browse filters Back)", async () => {
    sessionStorage.setItem(SCROLL_STORE_KEY, JSON.stringify({ "/browse?genres=28": 3100 }));
    render(<ScrollRestoration />);
    fireScroll(10);
    setUrl("/browse?genres=28");
    window.dispatchEvent(new PopStateEvent("popstate"));
    await frames(120);
    expect(scrollY).toBe(3100);
  });

  it("waits for a gated list before restoring", async () => {
    sessionStorage.setItem(SCROLL_STORE_KEY, JSON.stringify({ "/library?tab=watchlist": 1800 }));
    function Gate({ ready }: { ready: boolean }) {
      useScrollRestorationGate(ready);
      return null;
    }
    const { rerender } = render(
      <>
        <ScrollRestoration />
        <Gate ready={false} />
      </>
    );
    setUrl("/library?tab=watchlist");
    window.dispatchEvent(new PopStateEvent("popstate"));
    mockPathname = "/library"; // route committed, but its list is still loading
    rerender(
      <>
        <ScrollRestoration />
        <Gate ready={false} />
      </>
    );
    await frames(150);
    expect(scrollY).toBe(0);
    rerender(
      <>
        <ScrollRestoration />
        <Gate ready />
      </>
    );
    await frames(120);
    expect(scrollY).toBe(1800);
  });
});
