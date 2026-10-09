import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { RecItemDTO, RecRowDTO } from "@/lib/taste/recommend-types";

const session = { status: "unauthenticated" as "authenticated" | "unauthenticated" };
vi.mock("@/hooks/use-safe-session", () => ({ useSafeSession: () => session }));
vi.mock("@/hooks/use-analytics", () => ({ useAnalytics: () => ({ trackAction: vi.fn() }) }));
const getHomeRecs = vi.fn();
const getTasteTwins = vi.fn();
vi.mock("@/server/actions/taste-recs", () => ({
  getHomeRecs: () => getHomeRecs(),
  getTasteTwins: () => getTasteTwins(),
}));
vi.mock("@/components/features/movie/media-card", () => ({
  MediaCard: ({ item, subtitle }: { item: { id: number }; subtitle?: string }) => (
    <div data-testid="card">
      {item.id}:{subtitle ?? ""}
    </div>
  ),
  MediaCardSkeleton: () => <div data-testid="skeleton" />,
}));

const { ForYouSection, explanationText, toListItem } = await import("./for-you-section");
const { TasteTwinChip } = await import("./taste-twins-strip");

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
  explanation: { kind: "because", anchor: { mediaType: "movie", id: 9, title: "Inception" } },
  ...over,
});
const forYou: RecRowDTO = { id: "for-you", kind: "for_you", anchor: null, label: null, items: [item()] };

describe("for-you helpers", () => {
  it("maps movies and series to the MediaCard list shapes", () => {
    expect(toListItem(item())).toMatchObject({ title: "Arrival", release_date: "2016-11-10", media_type: "movie" });
    expect(toListItem(item({ mediaType: "series", title: "Dark" }))).toMatchObject({ name: "Dark", media_type: "tv" });
  });
  it("phrases explanations and omits the row's own anchor", () => {
    expect(explanationText(item(), forYou)).toBe("Like Inception");
    expect(explanationText(item({ explanation: { kind: "facet", label: "Korean thrillers" } }), forYou)).toBe(
      "Korean thrillers"
    );
    const because: RecRowDTO = {
      ...forYou,
      id: "cluster-0",
      kind: "because",
      anchor: { mediaType: "movie", id: 9, title: "Inception", posterPath: null },
    };
    expect(explanationText(item(), because)).toBeUndefined();
    expect(explanationText(item({ explanation: null }), forYou)).toBeUndefined();
  });
});

describe("ForYouSection", () => {
  it("renders nothing for guests and never calls the action", () => {
    session.status = "unauthenticated";
    const { container } = render(<ForYouSection />);
    expect(container.innerHTML).toBe("");
    expect(getHomeRecs).not.toHaveBeenCalled();
  });

  it("shows a skeleton, then rows with explanation subtitles", async () => {
    session.status = "authenticated";
    getHomeRecs.mockResolvedValue({ rows: [forYou], reason: "ok", algo: 1 });
    getTasteTwins.mockResolvedValue([]);
    render(<ForYouSection />);
    expect(screen.getAllByTestId("skeleton").length).toBeGreaterThan(0);
    expect(await screen.findByText("For you")).toBeTruthy();
    expect(screen.getByTestId("card").textContent).toBe("1:Like Inception");
  });

  it("labels the cold-start row and nudges toward rating", async () => {
    session.status = "authenticated";
    getHomeRecs.mockResolvedValue({ rows: [forYou], reason: "cold_start", algo: 1 });
    getTasteTwins.mockResolvedValue([]);
    render(<ForYouSection />);
    expect(await screen.findByText("Popular in your genres")).toBeTruthy();
    expect(screen.getByText(/Rate or heart a few titles/)).toBeTruthy();
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
