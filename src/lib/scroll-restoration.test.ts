import { describe, it, expect } from "vitest";
import {
  MAX_SCROLL_ENTRIES,
  SCROLL_STORE_KEY,
  getSavedScroll,
  runRestore,
  saveScroll,
  scrollKeyFor,
  type RestoreDeps,
  type StorageLike,
} from "./scroll-restoration";

function memoryStorage(): StorageLike & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => {
      data.set(k, v);
    },
  };
}

/** Deterministic frame clock: each frame advances time by 16ms. */
function fakeWindow(opts: { maxScroll: number; gated?: boolean }) {
  let t = 0;
  let y = 0;
  let queue: Array<() => void> = [];
  const state = { maxScroll: opts.maxScroll, gated: opts.gated ?? false, scrollCalls: 0 };
  const deps: RestoreDeps = {
    getScrollY: () => y,
    getMaxScrollY: () => state.maxScroll,
    scrollTo: (next) => {
      state.scrollCalls += 1;
      y = Math.min(next, state.maxScroll);
    },
    now: () => t,
    requestFrame: (cb) => {
      queue.push(cb);
      return queue.length;
    },
    cancelFrame: () => {
      queue = [];
    },
    isGated: () => state.gated,
  };
  const frames = (n: number) => {
    for (let i = 0; i < n; i += 1) {
      t += 16;
      const q = queue;
      queue = [];
      q.forEach((cb) => cb());
    }
  };
  return { deps, frames, state, getY: () => y, setY: (v: number) => (y = v) };
}

describe("scrollKeyFor", () => {
  it("keys by pathname + search and ignores the hash", () => {
    expect(scrollKeyFor({ pathname: "/browse", search: "?type=tv" })).toBe("/browse?type=tv");
    expect(scrollKeyFor({ pathname: "/library", search: "" })).toBe("/library");
  });
});

describe("saveScroll / getSavedScroll", () => {
  it("round-trips a position per URL", () => {
    const s = memoryStorage();
    saveScroll(s, "/browse", 1234.6);
    saveScroll(s, "/library?tab=watchlist", 80);
    expect(getSavedScroll(s, "/browse")).toBe(1235);
    expect(getSavedScroll(s, "/library?tab=watchlist")).toBe(80);
    expect(getSavedScroll(s, "/nope")).toBeNull();
  });

  it("evicts the least-recently-saved keys past the cap", () => {
    const s = memoryStorage();
    for (let i = 0; i < MAX_SCROLL_ENTRIES + 5; i += 1) saveScroll(s, `/p/${i}`, i);
    // Re-saving an old key refreshes it.
    saveScroll(s, "/p/5", 999);
    saveScroll(s, "/p/new", 1);
    expect(getSavedScroll(s, "/p/0")).toBeNull();
    expect(getSavedScroll(s, "/p/5")).toBe(999);
    expect(getSavedScroll(s, "/p/new")).toBe(1);
    const stored = JSON.parse(s.data.get(SCROLL_STORE_KEY) ?? "{}") as Record<string, number>;
    expect(Object.keys(stored).length).toBe(MAX_SCROLL_ENTRIES);
  });

  it("tolerates corrupt storage and storage that throws", () => {
    const s = memoryStorage();
    s.data.set(SCROLL_STORE_KEY, "{not json");
    expect(getSavedScroll(s, "/x")).toBeNull();
    const throwing: StorageLike = {
      getItem: () => null,
      setItem: () => {
        throw new Error("QuotaExceeded");
      },
    };
    expect(() => saveScroll(throwing, "/x", 10)).not.toThrow();
  });

  it("ignores invalid values", () => {
    const s = memoryStorage();
    saveScroll(s, "/x", Number.NaN);
    saveScroll(s, "/y", -5);
    expect(getSavedScroll(s, "/x")).toBeNull();
    expect(getSavedScroll(s, "/y")).toBeNull();
  });
});

describe("runRestore", () => {
  it("restores immediately when the page is already tall enough", async () => {
    const w = fakeWindow({ maxScroll: 5000 });
    const h = runRestore(2000, w.deps, { settleMs: 100 });
    w.frames(10);
    await expect(h.done).resolves.toBe("restored");
    expect(w.getY()).toBe(2000);
  });

  it("waits for the list to grow (e.g. cached pages re-rendering) before scrolling", async () => {
    const w = fakeWindow({ maxScroll: 800 }); // only page 1 rendered
    const h = runRestore(3000, w.deps, { settleMs: 100 });
    w.frames(5);
    expect(w.state.scrollCalls).toBe(0); // never scrolls to a clamped position early
    w.state.maxScroll = 6000; // remaining pages rendered
    w.frames(10);
    await expect(h.done).resolves.toBe("restored");
    expect(w.getY()).toBe(3000);
  });

  it("re-pins the target if late layout shifts move it during the settle window", async () => {
    const w = fakeWindow({ maxScroll: 6000 });
    const h = runRestore(3000, w.deps, { settleMs: 200 });
    w.frames(2);
    w.setY(2700); // something above shifted the page
    w.frames(2);
    expect(w.getY()).toBe(3000);
    w.frames(20);
    await expect(h.done).resolves.toBe("restored");
  });

  it("holds while gated by a loading list, then restores", async () => {
    const w = fakeWindow({ maxScroll: 6000, gated: true });
    const h = runRestore(1500, w.deps, { settleMs: 50, timeoutMs: 200, gatedTimeoutMs: 5000 });
    w.frames(30); // 480ms > timeoutMs, but gated → extended budget
    expect(w.state.scrollCalls).toBe(0);
    w.state.gated = false;
    w.frames(10);
    await expect(h.done).resolves.toBe("restored");
    expect(w.getY()).toBe(1500);
  });

  it("times out to the closest reachable position when the page never grows", async () => {
    const w = fakeWindow({ maxScroll: 900 });
    const h = runRestore(4000, w.deps, { timeoutMs: 160 });
    w.frames(20);
    await expect(h.done).resolves.toBe("timeout");
    expect(w.getY()).toBe(900);
  });

  it("stops pinning as soon as it is cancelled (user scrolled)", async () => {
    const w = fakeWindow({ maxScroll: 800 });
    const h = runRestore(3000, w.deps);
    w.frames(3);
    h.cancel();
    w.state.maxScroll = 6000;
    w.frames(10);
    await expect(h.done).resolves.toBe("cancelled");
    expect(w.state.scrollCalls).toBe(0);
  });
});
