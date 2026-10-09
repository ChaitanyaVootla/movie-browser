/**
 * Hover preview overlay (spec 2026-10-09 D2).
 *
 * BUGS pinned here:
 * - A fetch that resolved null showed the skeleton FOREVER (the old overlay
 *   rendered the skeleton whenever `data` was null).
 * - The whole preview was one <Link> with buttons inside it (invalid DOM).
 * - Any capture-phase scroll closed it, including scrolling INSIDE it.
 * - Moving into a portalled popover opened from it closed it (no holds).
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

import { HoverCardOverlay } from "./hover-card-overlay";
import { usePreviewStore } from "./preview-store";
import { preloadPreviewBody } from "./lazy-preview-body";

const ITEM = {
  id: 603,
  title: "The Matrix",
  poster_path: "/p.jpg",
  backdrop_path: "/b.jpg",
  vote_average: 8.2,
  vote_count: 100,
  popularity: 50,
  adult: false,
  release_date: "1999-03-31",
  overview: "",
  genre_ids: [],
} as const;

const DATA: HoverCardData = {
  id: 603,
  title: "The Matrix",
  backdrop_path: "/b.jpg",
  poster_path: "/p.jpg",
  overview: "A hacker learns the truth about his reality.",
  vote_average: 8.2,
  vote_count: 100,
  popularity: 50,
  year: "1999",
  runtime: 136,
  genres: [{ id: 28, name: "Action" }],
  cast: [{ id: 6384, name: "Keanu Reeves", character: "Neo", profile_path: null }],
  ratings: [{ name: "IMDb", rating: "87" }],
  watch_options: {
    options: [
      {
        name: "netflix",
        displayName: "Netflix",
        link: "https://n.example",
        image: "/n.svg",
        key: "n",
      },
    ],
    sourceCountry: "US",
    isFromFallback: false,
  },
};

let anchor: HTMLDivElement;

function openPreview(focusInside = false) {
  act(() => {
    usePreviewStore.getState().open({
      item: { ...ITEM, genre_ids: [] },
      anchor,
      imageSrc: null,
      openedBy: focusInside ? "keyboard" : "pointer",
      focusInside,
    });
  });
}

const panel = () => document.querySelector<HTMLElement>("[data-hover-preview]");

beforeAll(async () => {
  await preloadPreviewBody(); // real lazy module; warm its transform once
  // happy-dom has no layout; give the content a height so placement resolves.
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
  getHoverCardData.mockReset();
  anchor = document.createElement("div");
  anchor.innerHTML = `<a href="/movie/603/the-matrix">card</a>`;
  document.body.appendChild(anchor);
});
afterEach(() => {
  act(() => usePreviewStore.getState().close());
  cleanup();
  anchor.remove();
});

describe("HoverCardOverlay", () => {
  it("shows a fallback with Retry + View details when the fetch returns null (never an endless skeleton)", async () => {
    getHoverCardData.mockResolvedValueOnce(null);
    render(<HoverCardOverlay />);
    openPreview();

    expect(await screen.findByText(/Couldn.t load the details/)).toBeInTheDocument();
    expect(document.querySelector("[data-preview-skeleton]")).toBeNull();
    expect(screen.getByRole("link", { name: /View details/ })).toHaveAttribute(
      "href",
      "/movie/603/the-matrix"
    );
    // Title + actions still work from the list item alone.
    expect(screen.getByRole("heading", { name: "The Matrix" })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Actions for The Matrix" })).toBeInTheDocument();

    getHoverCardData.mockResolvedValueOnce(DATA);
    fireEvent.click(screen.getByRole("button", { name: /Retry/ }));
    expect(await screen.findByText(DATA.overview)).toBeInTheDocument();
    expect(getHoverCardData).toHaveBeenCalledTimes(2);
  });

  it("renders the overview, ratings, providers and cast once data arrives", async () => {
    getHoverCardData.mockResolvedValue(DATA);
    render(<HoverCardOverlay />);
    openPreview();
    expect(await screen.findByText(DATA.overview)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Watch on Netflix" })).toHaveAttribute(
      "target",
      "_blank"
    );
    expect(screen.getByRole("link", { name: /Keanu Reeves/ })).toBeInTheDocument();
    expect(panel()).toHaveAttribute("role", "dialog");
    expect(panel()).toHaveAttribute("aria-modal", "false");
  });

  it("mounts the preview and its action row exactly once (also after re-opening)", async () => {
    getHoverCardData.mockResolvedValue(DATA);
    render(<HoverCardOverlay />);
    openPreview();
    await screen.findByText(DATA.overview);
    openPreview();
    await screen.findByText(DATA.overview);
    expect(document.querySelectorAll("[data-hover-preview]")).toHaveLength(1);
    expect(document.querySelectorAll("[data-title-actions]")).toHaveLength(1);
    expect(screen.getAllByRole("button", { name: "Add to watchlist" })).toHaveLength(1);
  });

  it("nests no interactive element inside a link (valid DOM)", async () => {
    getHoverCardData.mockResolvedValue(DATA);
    render(<HoverCardOverlay />);
    openPreview();
    await screen.findByText(DATA.overview);
    const links = panel()?.querySelectorAll("a") ?? [];
    expect(links.length).toBeGreaterThan(0);
    links.forEach((a) => expect(a.querySelector("a, button, input, select, textarea")).toBeNull());
  });

  it("closes on Esc and returns focus to the card link", async () => {
    getHoverCardData.mockResolvedValue(DATA);
    render(<HoverCardOverlay />);
    openPreview(true);
    await screen.findByText(DATA.overview);
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(usePreviewStore.getState().target).toBeNull());
    expect(document.activeElement).toBe(anchor.querySelector("a"));
  });

  it("stays open when scrolling INSIDE the preview, closes on page scroll", async () => {
    getHoverCardData.mockResolvedValue(DATA);
    render(<HoverCardOverlay />);
    openPreview();
    await screen.findByText(DATA.overview);

    fireEvent.scroll(panel() as HTMLElement);
    expect(usePreviewStore.getState().target).not.toBeNull();

    fireEvent.scroll(window);
    await waitFor(() => expect(usePreviewStore.getState().target).toBeNull());
  });

  it("a hold (portalled popover open) keeps it open through pointer-leave and page scroll", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      getHoverCardData.mockResolvedValue(DATA);
      render(<HoverCardOverlay />);
      openPreview();
      await screen.findByText(DATA.overview);
      act(() => usePreviewStore.getState().hold());
      fireEvent.pointerLeave(panel() as HTMLElement, { pointerType: "mouse" });
      fireEvent.scroll(window);
      act(() => void vi.advanceTimersByTime(500));
      expect(usePreviewStore.getState().target).not.toBeNull();

      act(() => usePreviewStore.getState().release());
      act(() => void vi.advanceTimersByTime(500));
      expect(usePreviewStore.getState().target).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
});
