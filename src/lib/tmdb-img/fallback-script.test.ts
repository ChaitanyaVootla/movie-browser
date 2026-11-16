import { beforeAll, describe, expect, it, vi } from "vitest";
import { TMDB_IMG_FALLBACK_SCRIPT } from "./fallback-script";

const TMDB = "https://image.tmdb.org/t/p/w92/abc.jpg";

describe("TMDB image fallback script", () => {
  beforeAll(() => {
    localStorage.clear();
    new Function(TMDB_IMG_FALLBACK_SCRIPT)();
  });

  it("retries a failed TMDB image via /tmdb-img and hides the first error from React", () => {
    const img = document.createElement("img");
    img.setAttribute("src", TMDB);
    document.body.appendChild(img);
    const reactLike = vi.fn();
    document.body.addEventListener("error", reactLike, true);
    img.dispatchEvent(new Event("error"));
    expect(img.getAttribute("src")).toBe("/tmdb-img/t/p/w92/abc.jpg");
    expect(reactLike).not.toHaveBeenCalled();
    // A failed retry is not swallowed: the component's own fallback runs.
    img.dispatchEvent(new Event("error"));
    expect(reactLike).toHaveBeenCalledTimes(1);
    document.body.removeEventListener("error", reactLike, true);
  });

  it("leaves non-TMDB images alone", () => {
    const img = document.createElement("img");
    img.setAttribute("src", "https://image.themoviebrowser.com/movie/1/poster.webp");
    document.body.appendChild(img);
    img.dispatchEvent(new Event("error"));
    expect(img.getAttribute("src")).toBe("https://image.themoviebrowser.com/movie/1/poster.webp");
  });

  it("does not mark TMDB blocked until the proxied copy loads, then rewrites new images up front", async () => {
    expect(localStorage.getItem("tmdb-img-blocked")).toBeNull();
    const first = document.createElement("img");
    first.setAttribute("src", TMDB);
    document.body.appendChild(first);
    first.dispatchEvent(new Event("error"));
    first.dispatchEvent(new Event("load"));
    expect(localStorage.getItem("tmdb-img-blocked")).not.toBeNull();

    const later = document.createElement("img");
    later.setAttribute("src", "https://image.tmdb.org/t/p/w500/later.jpg");
    document.body.appendChild(later);
    await new Promise((r) => setTimeout(r, 0));
    expect(later.getAttribute("src")).toBe("/tmdb-img/t/p/w500/later.jpg");
  });
});

describe("YouTube thumbnail fallback", () => {
  it("retries img.youtube.com and i.ytimg.com via /yt-img", () => {
    for (const [src, want] of [
      ["https://img.youtube.com/vi/LY19rHKAaAg/mqdefault.jpg", "/yt-img/vi/LY19rHKAaAg/mqdefault.jpg"],
      ["https://i.ytimg.com/vi/LY19rHKAaAg/hqdefault.jpg", "/yt-img/vi/LY19rHKAaAg/hqdefault.jpg"],
    ]) {
      const img = document.createElement("img");
      img.setAttribute("src", src);
      document.body.appendChild(img);
      img.dispatchEvent(new Event("error"));
      expect(img.getAttribute("src")).toBe(want);
    }
  });
});
