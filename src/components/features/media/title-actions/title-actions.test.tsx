/**
 * TitleActions — the shared action row for the hover preview, the mobile
 * quick-info drawer and the detail action bar (spec 2026-10-09 D3).
 *
 * BUG pinned here (data loss): the card strip / hover card / drawer Watched
 * toggles unmarked SILENTLY, deleting every diary entry of a rewatched title.
 * They also wrote the store raw, so a failed sync was an unhandled rejection
 * with no toast, and analytics fired before the write landed.
 */
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const session = vi.hoisted(() => ({
  status: "authenticated" as "authenticated" | "unauthenticated",
}));
vi.mock("next-auth/react", () => ({
  useSession: () => ({
    data: session.status === "authenticated" ? { user: {} } : null,
    status: session.status,
  }),
  signIn: vi.fn(),
}));

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast }));

const analytics = vi.hoisted(() => ({
  trackWatched: vi.fn(),
  trackWatchlistAdd: vi.fn(),
  trackWatchlistRemove: vi.fn(),
  trackAction: vi.fn(),
  trackRating: vi.fn(),
}));
vi.mock("@/hooks/use-analytics", () => ({ useAnalytics: () => analytics }));

const getTitleDiary = vi.hoisted(() => vi.fn());
vi.mock("@/server/actions/tracking", () => ({ getTitleDiary, logWatchAction: vi.fn() }));
vi.mock("@/server/actions/user-ratings", () => ({ getRating: vi.fn(), setRating: vi.fn() }));
vi.mock("@/server/actions/lists", () => ({
  getItemListMembership: vi.fn(),
  addListItem: vi.fn(),
  removeListItem: vi.fn(),
  createList: vi.fn(),
}));
vi.mock("@/components/features/auth/login-dialog", () => ({
  LoginDialog: ({ open }: { open: boolean }) => (open ? <div role="dialog">Sign in</div> : null),
  useLoginDialog: () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const React = require("react") as typeof import("react");
    const [isOpen, setIsOpen] = React.useState(false);
    return {
      isOpen,
      setIsOpen,
      message: undefined,
      openLoginDialog: () => setIsOpen(true),
      closeLoginDialog: () => setIsOpen(false),
    };
  },
}));

import { useUserStore } from "@/stores/user";
import { TitleActions } from "./title-actions";

const fetchMock = vi.fn();

function seed(partial: Partial<ReturnType<typeof useUserStore.getState>>) {
  useUserStore.setState({
    isHydrated: true,
    watchedMovies: new Set(),
    watchlistMovies: new Set(),
    watchlistSeries: new Set(),
    seriesProgress: new Map(),
    ...partial,
  });
}

function renderMovie() {
  return render(
    <TitleActions
      variant="compact"
      itemId={42}
      mediaType="movie"
      title="Heat"
      href="/movie/42/heat"
    />
  );
}

beforeEach(() => {
  session.status = "authenticated";
  fetchMock.mockReset();
  fetchMock.mockResolvedValue({ ok: true });
  vi.stubGlobal("fetch", fetchMock);
  Object.values(toast).forEach((f) => f.mockClear());
  Object.values(analytics).forEach((f) => f.mockClear());
  getTitleDiary.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("TitleActions — watched (movie)", () => {
  it("asks before unmarking when there are several diary entries, and only deletes on confirm", async () => {
    seed({ watchedMovies: new Set([42]) });
    getTitleDiary.mockResolvedValue({
      watchCount: 3,
      entries: [],
      rating: null,
      lastWatchedAt: null,
    });
    renderMovie();

    fireEvent.click(screen.getByRole("button", { name: "Mark as unwatched" }));
    expect(await screen.findByText("Remove from watched?")).toBeInTheDocument();
    expect(screen.getByText(/You have 3 diary entries for “Heat”/)).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Remove all" }));
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith("/api/user/movie/42/watched", { method: "DELETE" })
    );
    await waitFor(() =>
      expect(analytics.trackWatched).toHaveBeenCalledWith(42, "movie", false, "Heat")
    );
  });

  it("does not delete anything when the confirmation is cancelled", async () => {
    seed({ watchedMovies: new Set([42]) });
    getTitleDiary.mockResolvedValue({
      watchCount: 2,
      entries: [],
      rating: null,
      lastWatchedAt: null,
    });
    renderMovie();
    fireEvent.click(screen.getByRole("button", { name: "Mark as unwatched" }));
    fireEvent.click(await screen.findByRole("button", { name: "Cancel" }));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(useUserStore.getState().watchedMovies.has(42)).toBe(true);
  });

  it("unmarks straight away with a single diary entry", async () => {
    seed({ watchedMovies: new Set([42]) });
    getTitleDiary.mockResolvedValue({
      watchCount: 1,
      entries: [],
      rating: null,
      lastWatchedAt: null,
    });
    renderMovie();
    fireEvent.click(screen.getByRole("button", { name: "Mark as unwatched" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(screen.queryByText("Remove from watched?")).not.toBeInTheDocument();
  });

  it("confirms when the diary count cannot be loaded (never a silent wipe)", async () => {
    seed({ watchedMovies: new Set([42]) });
    getTitleDiary.mockRejectedValue(new Error("network"));
    renderMovie();
    fireEvent.click(screen.getByRole("button", { name: "Mark as unwatched" }));
    expect(await screen.findByText("Remove from watched?")).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("marks watched without fetching the count (opening a preview is free)", async () => {
    seed({});
    renderMovie();
    expect(getTitleDiary).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Mark as watched" }));
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith("/api/user/movie/42/watched", { method: "POST" })
    );
    expect(getTitleDiary).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(analytics.trackWatched).toHaveBeenCalledWith(42, "movie", true, "Heat")
    );
  });

  it("a failed write toasts, reverts, and fires no analytics (no unhandled rejection)", async () => {
    seed({});
    fetchMock.mockResolvedValue({ ok: false });
    const unhandled = vi.fn();
    window.addEventListener("unhandledrejection", unhandled);
    renderMovie();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Mark as watched" }));
    });
    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(analytics.trackWatched).not.toHaveBeenCalled();
    expect(useUserStore.getState().watchedMovies.has(42)).toBe(false);
    expect(unhandled).not.toHaveBeenCalled();
    window.removeEventListener("unhandledrejection", unhandled);
  });

  it("signed out: opens the sign-in prompt instead of writing", async () => {
    session.status = "unauthenticated";
    seed({});
    renderMovie();
    fireEvent.click(screen.getByRole("button", { name: "Mark as watched" }));
    expect(await screen.findByText("Sign in")).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("TitleActions — watchlist", () => {
  it("tracks the add only after the write succeeds, with the title", async () => {
    seed({});
    renderMovie();
    fireEvent.click(screen.getByRole("button", { name: "Add to watchlist" }));
    await waitFor(() =>
      expect(analytics.trackWatchlistAdd).toHaveBeenCalledWith(42, "movie", "Heat")
    );
    expect(toast.success).toHaveBeenCalledWith("Added to watchlist");
  });

  it("does not track a failed add", async () => {
    seed({});
    fetchMock.mockResolvedValue({ ok: false });
    renderMovie();
    fireEvent.click(screen.getByRole("button", { name: "Add to watchlist" }));
    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(analytics.trackWatchlistAdd).not.toHaveBeenCalled();
  });
});

describe("TitleActions — series", () => {
  it("offers watchlist, rate and log, and a progress link instead of a movie watched toggle", () => {
    seed({
      seriesProgress: new Map([[7, { watched: 4, total: 10, pct: 40, status: "WATCHING" }]]),
    });
    render(
      <TitleActions
        variant="compact"
        itemId={7}
        mediaType="series"
        title="Dark"
        href="/series/7/dark"
      />
    );
    expect(screen.queryByRole("button", { name: /Mark as/ })).not.toBeInTheDocument();
    const progress = screen.getByRole("link", { name: /40% watched/ });
    expect(progress).toHaveAttribute("href", "/series/7/dark");
    expect(screen.getByRole("button", { name: "Add to watchlist" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Rate & review" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Log to diary" })).toBeInTheDocument();
  });

  it("series watchlist writes the series endpoint", async () => {
    seed({});
    render(
      <TitleActions
        variant="compact"
        itemId={7}
        mediaType="series"
        title="Dark"
        href="/series/7/dark"
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "Add to watchlist" }));
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith("/api/user/series/7/watchlist", { method: "POST" })
    );
  });
});
