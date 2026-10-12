import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TasteSnapshot } from "@/lib/taste/profile";
import { emptyFacets } from "@/lib/taste/profile";
import type { AxisExample } from "@/lib/taste/axes";
import type { ProfileWidgetData } from "./types";

const viewer = { resolved: false, authenticated: false, isOwner: false };
const h = vi.hoisted(() => ({ getViewerTasteAxes: vi.fn(), prompt: vi.fn() }));

vi.mock("@/hooks/use-mobile", () => ({ useMobile: () => false }));
vi.mock("@/hooks/use-history-dismiss", () => ({ useHistoryDismiss: () => undefined }));
vi.mock("@/hooks/use-analytics", () => ({ useAnalytics: () => ({ trackAction: vi.fn() }) }));
vi.mock("../profile-viewer-context", () => ({ useProfileViewer: () => viewer }));
vi.mock("@/server/actions/taste-explore", () => ({ getViewerTasteAxes: h.getViewerTasteAxes }));
vi.mock("@/components/features/media/title-actions/sign-in-dialog", () => ({
  useSignInPrompt: () => ({ prompt: h.prompt, dialog: null }),
}));
vi.mock("../taste/calibration-host", () => ({ CalibrationHost: () => null }));
vi.mock("../taste/lazy-bodies", async () => {
  const c = await import("../taste/cluster-explorer");
  const a = await import("../taste/axis-titles-sheet");
  return { LazyClusterExplorer: c.ClusterExplorerBody, LazyAxisTitles: a.AxisTitlesBody };
});
vi.mock("next/image", () => ({
  // eslint-disable-next-line @next/next/no-img-element
  default: ({ alt }: { alt: string }) => <img alt={alt} />,
}));

import { TasteCard } from "./taste-widgets";
import { TastePeopleWidget } from "./taste-people";
import { TasteMoodsWidget } from "./taste-moods";
import { WIDGET_META, buildDefaultLayout, migrateTasteWidgets, resolveLayout } from "./registry";

afterEach(cleanup);
beforeEach(() => {
  Object.assign(viewer, { resolved: false, authenticated: false, isOwner: false });
  h.getViewerTasteAxes.mockReset();
  h.prompt.mockReset();
});

const ref = (id: number, title: string) => ({ mediaType: "movie" as const, tmdbId: id, title, posterPath: null });
const ex = (id: number, title: string, value: string): AxisExample => ({ ...ref(id, title), value });

const snapshot: TasteSnapshot = {
  v: 2,
  computedAt: "2026-10-09T00:00:00.000Z",
  scope: "public",
  positiveCount: 14,
  signalCount: 20,
  axes: [
    {
      key: "mainstream",
      value: 0.2,
      support: 14,
      lowLabel: "Mainstream",
      highLabel: "Niche",
      caption: "Favourites average the top 20% by popularity",
      examples: {
        low: [ex(1, "Inception", "top 1% by popularity"), ex(2, "Arrival", "top 3% by popularity"), ex(3, "Se7en", "top 4% by popularity")],
        high: [ex(9, "Coherence", "top 80% by popularity")],
      },
    },
    {
      key: "era",
      value: 0.8,
      support: 14,
      lowLabel: "Classic",
      highLabel: "New",
      caption: "Median release year 2018 (catalog median 2012)",
      examples: { low: [], high: [] },
    },
  ],
  moods: [
    { type: "theme", key: "identity", label: "Identity and memory", count: 6, lift: 3.2, score: 1, titles: [ref(1, "Inception"), ref(2, "Arrival")] },
    { type: "mood", key: "intensity:medium", label: "Medium intensity", count: 12, lift: 1, score: 0.9, titles: [] },
    { type: "mood", key: "tone:dark", label: "Dark tone", count: 4, lift: 1.2, score: 0.4, titles: [ref(3, "Se7en")] },
  ],
  facets: emptyFacets(),
  people: {
    mostWatched: [
      { tmdbId: 525, name: "Christopher Nolan", profilePath: null, role: "director", count: 4, avgScore: 9.5, shrunkScore: 9, ratedCount: 4, titles: [ref(1, "Inception"), ref(5, "Memento")] },
    ],
    highestRated: [
      { tmdbId: 137427, name: "Denis Villeneuve", profilePath: null, role: "director", count: 3, avgScore: 9.6, shrunkScore: 8.8, ratedCount: 3, titles: [ref(2, "Arrival")] },
    ],
  },
  clusters: [
    { medoid: ref(1, "Inception"), size: 8, importance: 0.6, label: "Science Fiction", topFacets: ["Science Fiction", "Identity and memory"], members: [ref(1, "Inception"), ref(4, "Interstellar")] },
    { medoid: ref(3, "Se7en"), size: 5, importance: 0.4, label: "Crime", topFacets: ["Crime"], members: [ref(3, "Se7en")] },
  ],
};

function data(taste: ProfileWidgetData["taste"]): ProfileWidgetData {
  return {
    taste,
    username: "ada",
    displayName: "Ada Lovelace",
    ratingsHistogram: new Array(10).fill(0),
    topGenres: [], topDecades: [], topCountries: [], dailyActivity: [], recentWatches: [],
    fourFavorites: [], currentlyWatching: [], pinnedLists: [], reviews: [], discussions: [],
    rewatchCount: 0, counts: { followers: 0, following: 0, filmsWatched: 0, episodesWatched: 0, hoursWatched: 0 },
  } as unknown as ProfileWidgetData;
}
const ready = () => data({ status: "ready", snapshot });

describe("taste widgets: states + registry", () => {
  it("render nothing unless the public snapshot is ready", () => {
    for (const t of [null, { status: "hidden" as const }, { status: "insufficient" as const, positiveCount: 3, needed: 10 }]) {
      const { container } = render(<TasteCard data={data(t)} />);
      expect(container.innerHTML).toBe("");
      cleanup();
      for (const type of ["taste.card", "taste.dna", "taste.moods", "taste.people", "taste.clusters"] as const) {
        expect(WIDGET_META[type].isAvailable(data(t))).toBe(false);
      }
    }
  });

  it("the default layout uses one full-width Taste card + Moods + People", () => {
    const widgets = buildDefaultLayout(ready()).widgets;
    const types = widgets.map((w) => w.type);
    expect(types).toEqual(expect.arrayContaining(["taste.card", "taste.moods", "taste.people"]));
    expect(types).not.toContain("taste.dna");
    expect(types).not.toContain("taste.clusters");
    expect(widgets.find((w) => w.type === "taste.card")?.w).toBe(12);
  });

  it("migrates a saved v1 layout: first legacy taste widget → taste.card, the other dropped", () => {
    const saved = [
      { id: "a", type: "taste.dna" as const, x: 4, y: 2, w: 4, h: 3 },
      { id: "b", type: "taste.moods" as const, x: 8, y: 2, w: 4, h: 2 },
      { id: "c", type: "taste.clusters" as const, x: 0, y: 5, w: 6, h: 3 },
    ];
    const out = migrateTasteWidgets(saved);
    expect(out.map((w) => w.type)).toEqual(["taste.card", "taste.moods"]);
    expect(out[0]).toMatchObject({ id: "a", x: 0, y: 2, w: 12 });
    expect(migrateTasteWidgets(out)).toEqual(out); // idempotent
    expect(resolveLayout({ v: 1, cols: 12, widgets: saved }, ready()).widgets.map((w) => w.type)).toEqual(["taste.card", "taste.moods"]);
  });
});

describe("Taste card (public, cacheable)", () => {
  it("renders the strand, posters and top moods with NO viewer-only content", () => {
    const { container } = render(<TasteCard data={ready()} />);
    const meters = screen.getAllByRole("meter");
    expect(meters).toHaveLength(2);
    expect(meters[0].getAttribute("aria-valuenow")).toBe("20");
    expect(screen.getByText("Favourites average the top 20% by popularity")).toBeTruthy();
    expect(screen.getByText("14 titles")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Science Fiction: 8 titles like Inception/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Compare with me" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Share" })).toBeTruthy();
    // viewer-only content is absent from the server render
    expect(container.querySelector("[data-compare-marker]")).toBeNull();
    expect(container.querySelector("[data-compare-legend]")).toBeNull();
    expect(container.textContent).not.toMatch(/\bYou\b|You sit/);
    // neutral mood never shows
    expect(container.textContent).not.toContain("Medium intensity");
    expect(h.getViewerTasteAxes).not.toHaveBeenCalled();
  });

  it("an axis end with < 3 examples is disabled; one with 3+ opens its titles with per-title numbers", () => {
    render(<TasteCard data={ready()} />);
    expect(screen.queryByRole("button", { name: "Titles at the Niche end" })).toBeNull();
    expect(screen.getByText("Niche").closest("[aria-disabled]")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Titles at the Mainstream end" }));
    expect(screen.getByText("Mainstream end of this profile")).toBeTruthy();
    expect(screen.getByText("top 1% by popularity")).toBeTruthy();
    expect(screen.getAllByText("Se7en").length).toBeGreaterThan(0);
  });

  it("a cluster poster opens the explorer with its public members and other facets", () => {
    render(<TasteCard data={ready()} />);
    fireEvent.click(screen.getByRole("button", { name: /Science Fiction: 8 titles like Inception/ }));
    expect(screen.getByText("8 titles like Inception · 60% of this profile")).toBeTruthy();
    expect(screen.getAllByText("Interstellar").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Identity and memory").length).toBeGreaterThan(0);
  });

  it("Compare overlays the viewer's PUBLIC axes with a difference caption, and toggles off", async () => {
    Object.assign(viewer, { resolved: true, authenticated: true, isOwner: false });
    h.getViewerTasteAxes.mockResolvedValue({
      status: "ready",
      axes: [{ ...snapshot.axes[0], value: 0.65, examples: { low: [], high: [] } }],
    });
    const { container } = render(<TasteCard data={ready()} />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Compare with me" }));
    });
    await waitFor(() => expect(container.querySelector("[data-compare-marker='mainstream']")).toBeTruthy());
    expect(screen.getByText("You sit 45 points closer to Niche")).toBeTruthy();
    expect(container.querySelector("[data-compare-legend]")?.textContent).toContain("Ada");
    // an axis the viewer lacks keeps the owner's caption, no marker
    expect(container.querySelector("[data-compare-marker='era']")).toBeNull();
    expect(screen.getByText("Median release year 2018 (catalog median 2012)")).toBeTruthy();
    expect(container.textContent).not.toMatch(/you're|you are|\bare a\b/i);
    fireEvent.click(screen.getByRole("button", { name: "Hide comparison" }));
    expect(container.querySelector("[data-compare-marker]")).toBeNull();
    expect(screen.getByText("Favourites average the top 20% by popularity")).toBeTruthy();
  });

  it("Compare explains insufficient / hidden viewers; guests get the sign-in prompt; owners see no Compare", async () => {
    Object.assign(viewer, { resolved: true, authenticated: true, isOwner: false });
    h.getViewerTasteAxes.mockResolvedValue({ status: "insufficient" });
    render(<TasteCard data={ready()} />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Compare with me" }));
    });
    expect(await screen.findByText(/Rate 10 titles to compare/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Start" })).toBeTruthy();
    cleanup();

    h.getViewerTasteAxes.mockResolvedValue({ status: "hidden" });
    render(<TasteCard data={ready()} />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Compare with me" }));
    });
    expect(await screen.findByText(/hidden in Settings, under Privacy/)).toBeTruthy();
    cleanup();

    Object.assign(viewer, { resolved: true, authenticated: false, isOwner: false });
    render(<TasteCard data={ready()} />);
    fireEvent.click(screen.getByRole("button", { name: "Compare with me" }));
    expect(h.prompt).toHaveBeenCalledWith("Sign in to compare your taste");
    cleanup();

    Object.assign(viewer, { resolved: true, authenticated: true, isOwner: true });
    render(<TasteCard data={ready()} />);
    expect(screen.queryByRole("button", { name: "Compare with me" })).toBeNull();
    expect(screen.getByRole("button", { name: "Share" })).toBeTruthy();
  });
});

describe("Moods + People widgets", () => {
  it("people toggle switches lists; the metric opens that person's titles", () => {
    render(<TastePeopleWidget {...snapshot.people} />);
    expect(screen.getByText("Christopher Nolan")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Christopher Nolan: 4 titles" }));
    expect(screen.getAllByText("Memento").length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("radio", { name: "Highest rated" }));
    expect(screen.getByText("Denis Villeneuve")).toBeTruthy();
    expect(screen.getByText("4.4")).toBeTruthy(); // 8.8 / 2
    expect(screen.getByText("4.8 · 3 rated")).toBeTruthy(); // visible on touch, not a tooltip
  });

  it("mood chips show counts, drop neutral values, and open the supporting titles", () => {
    render(<TasteMoodsWidget moods={snapshot.moods} />);
    expect(screen.queryByText("Medium intensity")).toBeNull();
    const chip = screen.getByRole("button", { name: /Identity and memory/ });
    expect(chip.textContent).toContain("6");
    fireEvent.click(chip);
    expect(screen.getByText("6 titles, 3.2× the catalog rate")).toBeTruthy();
    expect(screen.getAllByText("Arrival").length).toBeGreaterThan(0);
  });

  it("copy never characterises the person", () => {
    const { container } = render(
      <>
        <TasteCard data={ready()} />
        <TastePeopleWidget {...snapshot.people} />
        <TasteMoodsWidget moods={snapshot.moods} />
      </>
    );
    expect(container.textContent).not.toMatch(/you're|you are|\bare a\b/i);
  });
});
