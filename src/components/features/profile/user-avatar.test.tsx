import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { UserAvatar } from "./user-avatar";

const GOOGLE = "https://lh3.googleusercontent.com/a/ACg8ocKabc123=s96-c";

/**
 * Radix Avatar preloads with `new window.Image()`. Fake it: any URL on a
 * "blocked" host errors, everything else loads.
 */
function stubImage(blockedHost: string) {
  class FakeImage {
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    referrerPolicy = "";
    crossOrigin: string | null = null;
    complete = false;
    naturalWidth = 0;
    private _src = "";
    addEventListener(type: string, fn: () => void) {
      if (type === "load") this.onload = fn;
      if (type === "error") this.onerror = fn;
    }
    removeEventListener() {}
    set src(v: string) {
      this._src = v;
      setTimeout(() => {
        if (v.includes(blockedHost)) this.onerror?.();
        else {
          this.complete = true;
          this.naturalWidth = 96;
          this.onload?.();
        }
      }, 0);
    }
    get src() {
      return this._src;
    }
  }
  vi.stubGlobal("Image", FakeImage);
  (window as unknown as { Image: unknown }).Image = FakeImage;
}

async function flush() {
  for (let i = 0; i < 5; i++) {
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
  }
}

describe("UserAvatar on a network that blocks Google photos", () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => vi.unstubAllGlobals());

  it("retries through /g-avatar and shows the photo", async () => {
    stubImage("googleusercontent.com");
    const { container } = render(<UserAvatar src={GOOGLE} name="Ada Lovelace" />);
    await flush();
    const img = container.querySelector("img");
    expect(img?.getAttribute("src")).toBe("/g-avatar/a/ACg8ocKabc123=s96-c");
    expect(localStorage.getItem("tmdb-img-blocked")).not.toBeNull();
  });

  it("uses the mirror up front once the network is known-blocked", async () => {
    localStorage.setItem("tmdb-img-blocked", String(Date.now()));
    stubImage("googleusercontent.com");
    const { container } = render(<UserAvatar src={GOOGLE} name="Ada Lovelace" />);
    await flush();
    expect(container.querySelector("img")?.getAttribute("src")).toBe(
      "/g-avatar/a/ACg8ocKabc123=s96-c",
    );
  });

  it("loads the Google URL directly when it is reachable", async () => {
    stubImage("nothing-blocked.invalid");
    const { container } = render(<UserAvatar src={GOOGLE} name="Ada Lovelace" />);
    await flush();
    expect(container.querySelector("img")?.getAttribute("src")).toBe(GOOGLE);
    expect(localStorage.getItem("tmdb-img-blocked")).toBeNull();
  });

  it("falls back to initials when the mirror fails too", async () => {
    stubImage("g");
    const { container } = render(<UserAvatar src={GOOGLE} name="Ada Lovelace" />);
    await flush();
    expect(container.querySelector("img")).toBeNull();
    expect(container.textContent).toContain("AL");
  });
});
