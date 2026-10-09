import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { TasteSnapshot } from "@/lib/taste/profile";
import { emptyFacets } from "@/lib/taste/profile";
import type { ProfileWidgetData } from "./types";

vi.mock("@/hooks/use-mobile", () => ({ useMobile: () => false }));
vi.mock("@/hooks/use-history-dismiss", () => ({ useHistoryDismiss: () => undefined }));
vi.mock("next/image", () => ({
  // eslint-disable-next-line @next/next/no-img-element
  default: ({ alt }: { alt: string }) => <img alt={alt} />,
}));

import { TasteClustersWidget, TasteDnaWidget } from "./taste-widgets";
import { TastePeopleWidget } from "./taste-people";
import { TasteMoodsWidget } from "./taste-moods";
import { WIDGET_META, buildDefaultLayout } from "./registry";

afterEach(cleanup);

const ref = (id: number, title: string) => ({ mediaType: "movie" as const, tmdbId: id, title, posterPath: null });

const snapshot: TasteSnapshot = {
  v: 1,
  computedAt: "2026-10-09T00:00:00.000Z",
  scope: "public",
  positiveCount: 14,
  signalCount: 20,
  axes: [
    { key: "mainstream", value: 0.2, support: 14, lowLabel: "Mainstream", highLabel: "Niche", caption: "Favourites average the top 20% by popularity" },
    { key: "era", value: 0.8, support: 14, lowLabel: "Classic", highLabel: "New", caption: "Median release year 2018 (catalog median 2012)" },
  ],
  moods: [
    { type: "theme", key: "identity", label: "Identity and memory", count: 6, lift: 3.2, score: 1, titles: [ref(1, "Inception"), ref(2, "Arrival")] },
    { type: "mood", key: "tone:dark", label: "Dark tone", count: 4, lift: 1.2, score: 0.4, titles: [ref(3, "Se7en")] },
  ],
  facets: emptyFacets(),
  people: {
    mostWatched: [{ tmdbId: 525, name: "Christopher Nolan", profilePath: null, role: "director", count: 4, avgScore: 9.5, shrunkScore: 9, ratedCount: 4 }],
    highestRated: [{ tmdbId: 137427, name: "Denis Villeneuve", profilePath: null, role: "director", count: 3, avgScore: 9.6, shrunkScore: 8.8, ratedCount: 3 }],
  },
  clusters: [
    { medoid: ref(1, "Inception"), size: 8, importance: 0.6, label: "Science Fiction", topFacets: ["Science Fiction"] },
    { medoid: ref(3, "Se7en"), size: 5, importance: 0.4, label: "Crime", topFacets: ["Crime"] },
  ],
};

function data(taste: ProfileWidgetData["taste"]): ProfileWidgetData {
  return {
    taste,
    ratingsHistogram: new Array(10).fill(0),
    topGenres: [], topDecades: [], topCountries: [], dailyActivity: [], recentWatches: [],
    fourFavorites: [], currentlyWatching: [], pinnedLists: [], reviews: [], discussions: [],
    rewatchCount: 0, counts: { followers: 0, following: 0, filmsWatched: 0, episodesWatched: 0, hoursWatched: 0 },
  } as unknown as ProfileWidgetData;
}

describe("taste widgets", () => {
  it("render nothing unless the public snapshot is ready", () => {
    for (const t of [null, { status: "hidden" as const }, { status: "insufficient" as const, positiveCount: 3, needed: 10 }]) {
      const { container } = render(
        <>
          <TasteDnaWidget data={data(t)} />
          <TasteClustersWidget data={data(t)} />
        </>
      );
      expect(container.innerHTML).toBe("");
      cleanup();
      for (const type of ["taste.dna", "taste.moods", "taste.people", "taste.clusters"] as const) {
        expect(WIDGET_META[type].isAvailable(data(t))).toBe(false);
      }
    }
  });

  it("joins the default layout when ready", () => {
    const types = buildDefaultLayout(data({ status: "ready", snapshot })).widgets.map((w) => w.type);
    expect(types).toEqual(expect.arrayContaining(["taste.dna", "taste.moods", "taste.people", "taste.clusters"]));
  });

  it("Taste DNA renders each axis as a labelled meter with its caption", () => {
    render(<TasteDnaWidget data={data({ status: "ready", snapshot })} />);
    const meters = screen.getAllByRole("meter");
    expect(meters).toHaveLength(2);
    expect(meters[0].getAttribute("aria-valuenow")).toBe("20");
    expect(screen.getByText("Favourites average the top 20% by popularity")).toBeTruthy();
    expect(screen.getByText("Niche")).toBeTruthy();
  });

  it("clusters show the medoid, label and member count", () => {
    render(<TasteClustersWidget data={data({ status: "ready", snapshot })} />);
    expect(screen.getByText("Science Fiction")).toBeTruthy();
    expect(screen.getByText("8 titles like Inception")).toBeTruthy();
  });

  it("people toggle switches between most watched and highest rated", () => {
    render(<TastePeopleWidget {...snapshot.people} />);
    expect(screen.getByText("Christopher Nolan")).toBeTruthy();
    fireEvent.click(screen.getByRole("radio", { name: "Highest rated" }));
    expect(screen.getByText("Denis Villeneuve")).toBeTruthy();
    expect(screen.getByText("4.4")).toBeTruthy(); // 8.8 / 2
  });

  it("mood chips show counts and open the supporting titles", () => {
    render(<TasteMoodsWidget moods={snapshot.moods} />);
    const chip = screen.getByRole("button", { name: /Identity and memory/ });
    expect(chip.textContent).toContain("6");
    fireEvent.click(chip);
    expect(screen.getByText("6 titles, 3.2× the catalog rate")).toBeTruthy();
    expect(screen.getByText("Arrival")).toBeTruthy();
  });

  it("copy never characterises the person", () => {
    const { container } = render(
      <>
        <TasteDnaWidget data={data({ status: "ready", snapshot })} />
        <TasteClustersWidget data={data({ status: "ready", snapshot })} />
        <TastePeopleWidget {...snapshot.people} />
        <TasteMoodsWidget moods={snapshot.moods} />
      </>
    );
    expect(container.textContent).not.toMatch(/you're|you are|\bare a\b/i);
  });
});
