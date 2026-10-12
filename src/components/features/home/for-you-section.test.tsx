import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import type { HomeRecsDTO, RecItemDTO, RecRowDTO, RecThumbRef } from "@/lib/taste/recommend-types";

const session = { status: "unauthenticated" as "authenticated" | "unauthenticated" };
vi.mock("@/hooks/use-safe-session", () => ({ useSafeSession: () => session }));
const trackAction = vi.fn();
vi.mock("@/hooks/use-analytics", () => ({ useAnalytics: () => ({ trackAction }) }));
const getHomeRecs = vi.fn();
const getTasteTwins = vi.fn();
const getMoreLikeThis = vi.fn();
vi.mock("@/server/actions/taste-recs", () => ({
  getHomeRecs: (...a: unknown[]) => getHomeRecs(...a),
  getTasteTwins: () => getTasteTwins(),
  getMoreLikeThis: (...a: unknown[]) => getMoreLikeThis(...a),
}));
const recordRecFeedback = vi.fn();
const undoRecFeedback = vi.fn();
vi.mock("@/server/actions/rec-feedback", () => ({
  recordRecFeedback: (...a: unknown[]) => recordRecFeedback(...a),
  undoRecFeedback: (...a: unknown[]) => undoRecFeedback(...a),
}));
vi.mock("@/server/actions/taste-calibration", () => ({
  getCalibrationDeck: vi.fn(async () => ({ items: [] })),
  submitCalibration: vi.fn(async () => ({ positives: 0, ready: false })),
}));
const toast = Object.assign(vi.fn(), { error: vi.fn() });
vi.mock("sonner", () => ({ toast }));
const urlState = { value: null as string | null, set: vi.fn() };
vi.mock("@/hooks/use-url-state", () => ({
  useUrlState: () => ({ get: () => urlState.value, set: urlState.set }),
}));
vi.mock("next/dynamic", () => ({ default: () => () => null }));
vi.mock("@/components/features/movie/media-card", () => ({
  MediaCard: ({ item }: { item: { id: number } }) => <div data-testid="card">{item.id}</div>,
  MediaCardSkeleton: () => <div data-testid="skeleton" />,
}));

// The body directly: next/dynamic is mocked to render nothing, and the shell only lazy-loads it.
const { default: ForYouSection } = await import("./for-you/for-you-body");
const { TasteTwinChip } = await import("./taste-twins-strip");
const { tagFor, toListItem, headingTitles, joinTitles, cosBucket } = await import("./for-you/rec-copy");
const { useTasteUiStore } = await import("@/stores/taste-ui");

const ref = (id: number, title: string): RecThumbRef => ({ mediaType: "movie", id, title, posterPath: null });
const because = (a: RecThumbRef) => ({ kind: "because" as const, anchor: a, cos: 0.5, alsoNear: [], facets: [] });
const item = (over: Partial<RecItemDTO> = {}): RecItemDTO => ({
  mediaType: "movie",
  id: 1,
  title: "Arrival",
  posterPath: "/a.jpg",
  backdropPath: null,
  releaseDate: "2016-11-10",
  voteAverage: 7.6,
  voteCount: 100,
  popularity: 3,
  genres: [],
  source: "taste",
  explanation: because(ref(9, "Inception")),
  ...over,
});
const forYou: RecRowDTO = { id: "for-you", kind: "for_you", anchors: [], label: null, items: [item()], tune: null };
const matrix = ref(603, "The Matrix");
const runner = ref(78, "Blade Runner");
const becauseRow: RecRowDTO = {
  id: "cluster-0",
  kind: "because",
  anchors: [matrix, runner],
  label: null,
  tune: null,
  items: [
    item({ id: 11, explanation: because(matrix) }),
    item({ id: 12, explanation: because(runner) }),
    item({ id: 13, explanation: because(runner) }),
    item({ id: 14, explanation: because(matrix) }),
  ],
};
const home = (over: Partial<HomeRecsDTO> = {}): HomeRecsDTO => ({
  rows: [forYou],
  reason: "ok",
  algo: 4,
  tuneAvailable: { series: 3, movies: 0 },
  tuneChips: [
    { token: "movies", label: "Movies" },
    { token: "series", label: "Series" },
    { token: "g:thriller", label: "Thriller" },
  ],
  positiveCount: 42,
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  urlState.value = null;
  getTasteTwins.mockResolvedValue([]);
  recordRecFeedback.mockResolvedValue({ ok: true });
  undoRecFeedback.mockResolvedValue({ ok: true });
});

describe("one-why model (heading = set, tag = member)", () => {
  it("every rendered tag in a because row names a heading anchor, never the first one", () => {
    const heading = new Set(becauseRow.anchors.map((a) => a.id));
    for (const it of becauseRow.items) {
      const tag = tagFor(it, becauseRow);
      if (tag) {
        expect(tag.kind).toBe("anchor");
        if (tag.kind === "anchor") {
          expect(heading.has(tag.anchor.id)).toBe(true);
          expect(tag.anchor.id).not.toBe(becauseRow.anchors[0].id);
        }
      }
    }
    expect(tagFor(becauseRow.items[0], becauseRow)).toBeNull();
    expect(tagFor(becauseRow.items[1], becauseRow)).toEqual({ kind: "anchor", anchor: runner });
  });
  it("drops a tag naming a title outside the heading (defence in depth)", () => {
    expect(tagFor(item({ explanation: because(ref(1, "Elsewhere")) }), becauseRow)).toBeNull();
  });
  it("for-you tags anchors and facets; seed rows never tag", () => {
    expect(tagFor(item(), forYou)).toEqual({ kind: "anchor", anchor: ref(9, "Inception") });
    expect(tagFor(item({ explanation: { kind: "facet", label: "Korean thrillers", facets: [] } }), forYou)).toEqual({
      kind: "facet",
      label: "Korean thrillers",
    });
    const seed: RecRowDTO = { ...forYou, id: "seed-m:1", kind: "seed", anchors: [matrix] };
    expect(tagFor(item({ explanation: { kind: "seed", seed: matrix, cos: 0.6 } }), seed)).toBeNull();
  });
  it("copy helpers", () => {
    expect(joinTitles(["A"])).toBe("A");
    expect(joinTitles(["A", "B"])).toBe("A & B");
    expect(joinTitles(["A", "B", "C"])).toBe("A, B & C");
    expect(headingTitles([matrix, runner])).toEqual({ all: ["The Matrix", "Blade Runner"], first: "The Matrix", more: 1 });
    expect([cosBucket(0.6), cosBucket(0.4), cosBucket(0.31)]).toEqual(["very close", "close", "near"]);
    expect(toListItem(item({ mediaType: "series", title: "Dark" }))).toMatchObject({ name: "Dark", media_type: "tv" });
  });
});

describe("ForYouSection", () => {
  it("renders nothing for guests and never calls the action", () => {
    session.status = "unauthenticated";
    const { container } = render(<ForYouSection />);
    expect(container.innerHTML).toBe("");
    expect(getHomeRecs).not.toHaveBeenCalled();
  });

  it("skeleton, then the For-you row with the built-from line, tags and the tune bar", async () => {
    session.status = "authenticated";
    getHomeRecs.mockResolvedValue(home({ rows: [forYou, becauseRow] }));
    render(<ForYouSection />);
    expect(screen.getAllByTestId("skeleton").length).toBeGreaterThan(0);
    expect(await screen.findByText("Built from 42 titles you rated, hearted or logged")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Why this pick: Inception" })).toBeTruthy();
    // Because heading names the whole set.
    expect(screen.getByText("Because you loved The Matrix & Blade Runner")).toBeTruthy();
    // Chip with no survivors is disabled.
    expect((screen.getByRole("button", { name: "Movies" }) as HTMLButtonElement).disabled).toBe(true);
    expect(useTasteUiStore.getState().hasProfile).toBe(true);
  });

  it("every tag rendered in a because row names a heading title (DOM)", async () => {
    session.status = "authenticated";
    getHomeRecs.mockResolvedValue(home({ rows: [becauseRow] }));
    render(<ForYouSection />);
    await screen.findByText("Because you loved The Matrix & Blade Runner");
    const tags = screen.getAllByRole("button", { name: /^Why this pick: / });
    expect(tags.length).toBe(2);
    for (const t of tags) expect(t.textContent).toBe("Blade Runner");
  });

  it("reads ?tune= on first load and passes it to the action", async () => {
    session.status = "authenticated";
    urlState.value = "series,darker";
    getHomeRecs.mockResolvedValue(home());
    render(<ForYouSection />);
    await screen.findByText(/^Built from/);
    expect(getHomeRecs).toHaveBeenCalledWith({ tune: { media: "series", tone: "dark" }, shuffle: undefined, exclude: undefined });
  });

  it("a chip press re-queries with the tune and writes the URL", async () => {
    session.status = "authenticated";
    getHomeRecs.mockResolvedValue(home());
    render(<ForYouSection />);
    await screen.findByText(/^Built from/);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Series" }));
    });
    expect(getHomeRecs).toHaveBeenLastCalledWith({ tune: { media: "series" }, shuffle: undefined, exclude: undefined });
    expect(urlState.set).toHaveBeenCalledWith({ tune: "series" });
    expect(trackAction).toHaveBeenCalledWith({ action: "rec_tune", metadata: { tokens: ["series"] } });
  });

  it("Not for me removes the card, persists, and Undo restores it", async () => {
    session.status = "authenticated";
    getHomeRecs.mockResolvedValue(home());
    render(<ForYouSection />);
    await screen.findByText(/^Built from/);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Not for me: Arrival" }));
    });
    expect(screen.queryByTestId("card")).toBeNull();
    expect(recordRecFeedback).toHaveBeenCalledWith({
      mediaType: "movie",
      id: 1,
      kind: "DISMISS",
      rowId: "for-you",
      anchorKey: "m:9",
    });
    const opts = toast.mock.calls[0]?.[1] as { action: { onClick: () => void } };
    expect(toast.mock.calls[0]?.[0]).toBe("Removed from your picks");
    await act(async () => opts.action.onClick());
    expect(screen.getByTestId("card")).toBeTruthy();
    expect(undoRecFeedback).toHaveBeenCalledWith({ mediaType: "movie", id: 1, kind: "DISMISS" });
  });

  it("a recs-tune event from Cue applies validated tokens only", async () => {
    session.status = "authenticated";
    getHomeRecs.mockResolvedValue(home());
    render(<ForYouSection />);
    await screen.findByText(/^Built from/);
    await act(async () => {
      window.dispatchEvent(new CustomEvent("recs-tune", { detail: { tokens: ["series", "g:horror", "g:thriller", "bogus"] } }));
    });
    expect(getHomeRecs).toHaveBeenLastCalledWith({
      tune: { media: "series", genres: ["thriller"] },
      shuffle: undefined,
      exclude: undefined,
    });
  });

  it("More like this inserts a seeded row under its source row (max 2, removable)", async () => {
    session.status = "authenticated";
    getHomeRecs.mockResolvedValue(home({ rows: [forYou, becauseRow] }));
    const seedRow = (id: number, title: string): RecRowDTO => ({
      id: `seed-m:${id}`,
      kind: "seed",
      anchors: [ref(id, title)],
      label: null,
      tune: null,
      items: [1, 2, 3, 4].map((n) => item({ id: id * 10 + n, explanation: { kind: "seed", seed: ref(id, title), cos: 0.7 } })),
    });
    const { useHomeRecs } = await import("./for-you/use-home-recs");
    const { renderHook, waitFor } = await import("@testing-library/react");
    const { result } = renderHook(() => useHomeRecs(true));
    act(() => result.current.actions.onUrlTokens([]));
    await waitFor(() => expect(result.current.rows.length).toBe(2));
    for (const [id, title] of [[1, "A"], [2, "B"], [3, "C"]] as const) {
      getMoreLikeThis.mockResolvedValueOnce(seedRow(id, title));
      await act(async () => result.current.actions.moreLikeThis(item(), forYou));
    }
    expect(result.current.rows.map((r) => r.id)).toEqual(["for-you", "seed-m:2", "seed-m:3", "cluster-0"]);
    act(() => result.current.actions.removeSeed("seed-m:2"));
    expect(result.current.rows.map((r) => r.id)).toEqual(["for-you", "seed-m:3", "cluster-0"]);
  });

  it("cold start shows the calibration deck heading instead of a popular row", async () => {
    session.status = "authenticated";
    getHomeRecs.mockResolvedValue(home({ reason: "cold_start" }));
    render(<ForYouSection />);
    expect(await screen.findByText("Start your taste profile")).toBeTruthy();
    expect(screen.queryByText("Popular in your genres")).toBeNull();
  });
});

describe("TasteTwinChip", () => {
  it("links to the profile with the match percentage and initials fallback", () => {
    render(<TasteTwinChip twin={{ username: "ada", displayName: "Ada Lovelace", avatarUrl: null, match: 72 }} />);
    expect(screen.getByRole("link").getAttribute("href")).toBe("/u/ada");
    expect(screen.getByText("72%")).toBeTruthy();
    expect(screen.getByText("AL")).toBeTruthy();
  });
});

describe("Fable rule: no copy characterizes the user", () => {
  it("rendered For-you copy never says you're / you are / are a", async () => {
    session.status = "authenticated";
    getHomeRecs.mockResolvedValue(home({ rows: [forYou, becauseRow] }));
    const { container } = render(<ForYouSection />);
    await screen.findByText(/^Built from/);
    expect(container.textContent ?? "").not.toMatch(/you're|you are|are a\b/i);
  });
});
