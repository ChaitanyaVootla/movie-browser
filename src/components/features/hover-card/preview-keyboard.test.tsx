/**
 * Keyboard + focus behaviour of the card preview (wrapper + overlay together).
 *
 * BUGS pinned here (review Oct 9 2026):
 * - ArrowDown → Esc handed focus back to the card, whose onFocus armed the
 *   keyboard peek, so the preview RE-OPENED ~700ms after being dismissed.
 * - The panel is portalled to the end of <body>: Tab out of its last control
 *   landed on the footer / browser chrome and Shift+Tab out of the first on
 *   whatever preceded the portal. Either way the user lost their place.
 * - A resize while a nested dialog was open closed the preview, unmounting the
 *   dialog and discarding typed text.
 * - The same title opened from a second card kept the first card's panel/rect.
 */
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { HoverCardData } from "@/server/actions/hover-card";

const getHoverCardData = vi.hoisted(() => vi.fn());
vi.mock("@/server/actions/hover-card", () => ({ getHoverCardData }));
vi.mock("@/server/actions/tracking", () => ({ getTitleDiary: vi.fn(), logWatchAction: vi.fn() }));
vi.mock("@/server/actions/user-ratings", () => ({ getRating: vi.fn(), setRating: vi.fn() }));
vi.mock("@/server/actions/lists", () => ({
  getItemListMembership: vi.fn(),
  addListItem: vi.fn(),
  removeListItem: vi.fn(),
  createList: vi.fn(),
}));
vi.mock("@/hooks/use-analytics", () => ({
  useAnalytics: () => ({
    trackWatchClick: vi.fn(),
    trackWatched: vi.fn(),
    trackWatchlistAdd: vi.fn(),
    trackWatchlistRemove: vi.fn(),
    trackAction: vi.fn(),
    trackRating: vi.fn(),
  }),
}));

import { MediaCard } from "@/components/features/movie/media-card";
import { HoverCardOverlay } from "./hover-card-overlay";
import { usePreviewStore } from "./preview-store";
import { KEYBOARD_PEEK_DELAY_MS } from "./hover-card-wrapper";
import { preloadPreviewBody } from "./lazy-preview-body";

function movie(id: number, title: string) {
  return {
    id,
    title,
    poster_path: "/p.jpg",
    backdrop_path: "/b.jpg",
    vote_average: 7.5,
    vote_count: 10,
    popularity: 5,
    adult: false,
    release_date: "2020-01-01",
    overview: "",
    genre_ids: [],
  };
}

function data(id: number, title: string): HoverCardData {
  return {
    id,
    title,
    backdrop_path: "/b.jpg",
    poster_path: "/p.jpg",
    overview: `${title} overview.`,
    vote_average: 7.5,
    vote_count: 10,
    popularity: 5,
    year: "2020",
    genres: [],
    cast: [{ id: 1, name: "Some Actor", character: "Lead", profile_path: null }],
    ratings: [],
    watch_options: { options: [], sourceCountry: "US", isFromFallback: false },
  };
}

const A = movie(1, "Alpha");
const B = movie(2, "Bravo");

const panel = () => document.querySelector<HTMLElement>("[data-hover-preview]");
const cardLink = (title: string) =>
  screen
    .getAllByRole("link")
    .find(
      (a) => a.textContent?.includes(title) && a.querySelector("[data-card-art]")
    ) as HTMLElement;

beforeAll(async () => {
  // Pay the one-off module transform of the lazy body up front (it can exceed
  // waitFor's default 1s on a cold run); the focus effect's wait-for-body path
  // (MutationObserver) is what covers a not-yet-loaded chunk in the browser.
  await preloadPreviewBody();
  Object.defineProperty(HTMLElement.prototype, "offsetHeight", {
    configurable: true,
    get: () => 420,
  });
});
afterAll(() => {
  // @ts-expect-error -- restore the prototype default
  delete HTMLElement.prototype.offsetHeight;
});

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  getHoverCardData.mockImplementation((id: number) =>
    Promise.resolve(id === 1 ? data(1, "Alpha") : data(2, "Bravo"))
  );
});
afterEach(() => {
  act(() => usePreviewStore.getState().close());
  cleanup();
  vi.useRealTimers();
});

function renderGrid() {
  return render(
    <>
      <MediaCard item={A} />
      <MediaCard item={B} />
      <HoverCardOverlay />
    </>
  );
}

async function openWithArrowDown(title: string) {
  const link = cardLink(title);
  act(() => link.focus());
  fireEvent.keyDown(link, { key: "ArrowDown" });
  await screen.findByText(`${title} overview.`);
  await waitFor(() => expect(panel()?.contains(document.activeElement)).toBe(true));
  return link;
}

describe("preview keyboard focus", () => {
  it("ArrowDown → Esc closes for good: no peek re-open after focus is handed back", async () => {
    renderGrid();
    const link = await openWithArrowDown("Alpha");

    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(usePreviewStore.getState().target).toBeNull());
    expect(document.activeElement).toBe(link);

    act(() => void vi.advanceTimersByTime(KEYBOARD_PEEK_DELAY_MS + 300));
    expect(usePreviewStore.getState().target).toBeNull();
  });

  it("a real keyboard focus still peeks (the suppression is only for restores)", async () => {
    renderGrid();
    act(() => cardLink("Bravo").focus());
    act(() => void vi.advanceTimersByTime(KEYBOARD_PEEK_DELAY_MS + 50));
    expect(usePreviewStore.getState().target).toMatchObject({
      openedBy: "keyboard",
      focusInside: false,
    });
  });

  it("Shift+Tab on the first control closes and returns focus to the card", async () => {
    renderGrid();
    const link = await openWithArrowDown("Alpha");
    const first = panel()?.querySelector<HTMLElement>("a[href]") as HTMLElement; // the art link
    act(() => first.focus());
    fireEvent.keyDown(first, { key: "Tab", shiftKey: true });
    await waitFor(() => expect(usePreviewStore.getState().target).toBeNull());
    expect(document.activeElement).toBe(link);
    act(() => void vi.advanceTimersByTime(KEYBOARD_PEEK_DELAY_MS + 300));
    expect(usePreviewStore.getState().target).toBeNull();
  });

  it("Tab past the last control closes and moves to the next focusable after the card", async () => {
    renderGrid();
    await openWithArrowDown("Alpha");
    const all = panel()?.querySelectorAll<HTMLElement>("a[href], button:not([disabled])") ?? [];
    const last = all[all.length - 1];
    act(() => last.focus());
    fireEvent.keyDown(last, { key: "Tab" });
    await waitFor(() => expect(usePreviewStore.getState().target?.item.id).not.toBe(1));
    expect(document.activeElement).toBe(cardLink("Bravo"));
  });

  it("Tab inside the panel (not at an edge) is left to the browser", async () => {
    renderGrid();
    await openWithArrowDown("Alpha");
    const active = document.activeElement as HTMLElement; // first action, not an edge
    const ev = fireEvent.keyDown(active, { key: "Tab" });
    expect(ev).toBe(true); // not preventDefault'ed
    expect(usePreviewStore.getState().target).not.toBeNull();
  });
});

describe("preview resilience", () => {
  it("a resize does not close the preview while a nested overlay holds it", async () => {
    renderGrid();
    await openWithArrowDown("Alpha");
    act(() => usePreviewStore.getState().hold());
    fireEvent(window, new Event("resize"));
    expect(usePreviewStore.getState().target).not.toBeNull();
    act(() => usePreviewStore.getState().release());
    fireEvent(window, new Event("resize"));
    await waitFor(() => expect(usePreviewStore.getState().target).toBeNull());
  });

  it("the same title opened from a different card re-anchors (fresh panel)", async () => {
    renderGrid();
    const first = document.createElement("div");
    first.innerHTML = `<a href="/movie/1/alpha">x</a>`;
    const second = document.createElement("div");
    second.innerHTML = `<a href="/movie/1/alpha">y</a>`;
    document.body.append(first, second);
    const open = (anchor: HTMLElement) =>
      act(() =>
        usePreviewStore
          .getState()
          .open({ item: A, anchor, imageSrc: null, openedBy: "pointer", focusInside: false })
      );
    open(first);
    await screen.findByText("Alpha overview.");
    const before = panel();
    open(second);
    await waitFor(() => {
      const panels = document.querySelectorAll("[data-hover-preview]");
      expect(panels[panels.length - 1]).not.toBe(before);
    });
    first.remove();
    second.remove();
  });
});
