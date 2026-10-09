/**
 * Cards are display-only and open the title preview (spec 2026-10-09 D1/D2/D4).
 *
 * BUGS pinned here:
 * - The card carried a hover action strip (watched/watchlist/log buttons)
 *   that was movie-only and unmarked watched silently.
 * - The preview kept opening after a click inside the card.
 * - Long-press was width-gated (<768px), so touch tablets never got it.
 */
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/actions/hover-card", () => ({
  getHoverCardData: vi.fn(() => Promise.resolve(null)),
}));
vi.mock("@/components/features/hover-card/lazy-preview-body", () => ({
  preloadPreviewBody: vi.fn(),
  LazyPreviewBody: () => null,
}));

import { MediaCard } from "./media-card";
import { useUserStore } from "@/stores/user";
import { usePreviewStore } from "@/components/features/hover-card/preview-store";
import { useQuickInfoStore } from "@/components/features/hover-card/quick-info-store";
import {
  PREVIEW_OPEN_DELAY_MS,
  LONG_PRESS_MS,
} from "@/components/features/hover-card/hover-card-wrapper";

const MOVIE = {
  id: 27205,
  title: "Inception",
  poster_path: "/p.jpg",
  backdrop_path: "/b.jpg",
  vote_average: 8.4,
  vote_count: 100,
  popularity: 10,
  adult: false,
  release_date: "2010-07-16",
  overview: "",
  genre_ids: [],
};

const SERIES = {
  id: 1399,
  name: "Game of Thrones",
  poster_path: "/s.jpg",
  backdrop_path: "/sb.jpg",
  vote_average: 8.5,
  vote_count: 100,
  popularity: 10,
  adult: false,
  first_air_date: "2011-04-17",
  overview: "",
  genre_ids: [],
};

let fine = true;
beforeEach(() => {
  vi.useFakeTimers();
  fine = true;
  vi.stubGlobal("matchMedia", (q: string) => ({
    matches: q.includes("pointer: fine") ? fine : false,
    media: q,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    onchange: null,
    dispatchEvent: () => false,
  }));
  useUserStore.setState({
    isHydrated: true,
    watchedMovies: new Set(),
    watchlistMovies: new Set(),
    watchlistSeries: new Set(),
  });
});
afterEach(() => {
  act(() => {
    usePreviewStore.getState().close();
    useQuickInfoStore.getState().close();
  });
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const wrapperOf = () => screen.getByRole("link").parentElement as HTMLElement;

describe("MediaCard", () => {
  it("is display-only for movies AND series: one link, no buttons", () => {
    render(
      <>
        <MediaCard item={MOVIE} />
        <MediaCard item={SERIES} />
      </>
    );
    expect(screen.getAllByRole("link")).toHaveLength(2);
    expect(screen.queryAllByRole("button")).toHaveLength(0);
  });

  it("shows the viewer's watchlist state in the scoop", () => {
    useUserStore.setState({ watchlistMovies: new Set([MOVIE.id]) });
    render(<MediaCard item={MOVIE} />);
    expect(screen.getByText("On your watchlist")).toBeInTheDocument();
  });

  it("opens the preview after the hover-intent delay for a fine pointer", () => {
    render(<MediaCard item={MOVIE} />);
    fireEvent.pointerEnter(wrapperOf(), { pointerType: "mouse", buttons: 0 });
    act(() => void vi.advanceTimersByTime(PREVIEW_OPEN_DELAY_MS - 50));
    expect(usePreviewStore.getState().target).toBeNull();
    act(() => void vi.advanceTimersByTime(60));
    expect(usePreviewStore.getState().target?.item.id).toBe(MOVIE.id);
  });

  it("never opens for a coarse pointer, and a press cancels + suppresses until the pointer leaves", () => {
    render(<MediaCard item={MOVIE} />);
    fine = false;
    fireEvent.pointerEnter(wrapperOf(), { pointerType: "mouse", buttons: 0 });
    act(() => void vi.advanceTimersByTime(1000));
    expect(usePreviewStore.getState().target).toBeNull();

    fine = true;
    fireEvent.pointerLeave(wrapperOf(), { pointerType: "mouse" });
    fireEvent.pointerEnter(wrapperOf(), { pointerType: "mouse", buttons: 0 });
    fireEvent.pointerDown(wrapperOf(), { pointerType: "mouse" });
    act(() => void vi.advanceTimersByTime(1000));
    expect(usePreviewStore.getState().target).toBeNull();
    // Still inside the card after the click: no re-open.
    fireEvent.pointerEnter(wrapperOf(), { pointerType: "mouse", buttons: 0 });
    act(() => void vi.advanceTimersByTime(1000));
    expect(usePreviewStore.getState().target).toBeNull();
  });

  it("touch long-press (any width) opens the quick-info drawer and swallows the click", () => {
    window.innerWidth = 1024; // a tablet: the old code gated long-press on < 768
    render(<MediaCard item={SERIES} />);
    fireEvent.pointerDown(wrapperOf(), { pointerType: "touch", clientX: 10, clientY: 10 });
    act(() => void vi.advanceTimersByTime(LONG_PRESS_MS + 10));
    expect(useQuickInfoStore.getState()).toMatchObject({ isOpen: true, item: { id: SERIES.id } });

    const click = new MouseEvent("click", { bubbles: true, cancelable: true });
    screen.getByRole("link").dispatchEvent(click);
    expect(click.defaultPrevented).toBe(true);
  });

  it("a touch that moves (a scroll) does not long-press", () => {
    render(<MediaCard item={MOVIE} />);
    fireEvent.pointerDown(wrapperOf(), { pointerType: "touch", clientX: 10, clientY: 10 });
    fireEvent.pointerMove(wrapperOf(), { pointerType: "touch", clientX: 10, clientY: 40 });
    act(() => void vi.advanceTimersByTime(LONG_PRESS_MS + 10));
    expect(useQuickInfoStore.getState().isOpen).toBe(false);
  });

  it("ArrowDown on the focused card opens the preview with focus moving inside", () => {
    render(<MediaCard item={MOVIE} />);
    const link = screen.getByRole("link");
    expect(link).toHaveAttribute("aria-keyshortcuts", "ArrowDown");
    fireEvent.keyDown(link, { key: "ArrowDown" });
    expect(usePreviewStore.getState().target).toMatchObject({
      openedBy: "keyboard",
      focusInside: true,
    });
  });
});
