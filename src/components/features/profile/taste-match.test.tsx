import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import type { TasteMatchDTO } from "@/lib/taste/recommend-types";

const viewer = { resolved: true, authenticated: true, isOwner: false };
vi.mock("./profile-viewer-context", () => ({ useProfileViewer: () => viewer }));
const track = vi.fn();
// A NEW function per render, like the real hook while the session settles.
vi.mock("@/hooks/use-analytics", () => ({ useAnalytics: () => ({ trackAction: (...a: unknown[]) => track(...a) }) }));
const getTasteMatch = vi.fn();
vi.mock("@/server/actions/taste-recs", () => ({ getTasteMatch: (u: string) => getTasteMatch(u) }));

const { TasteMatch } = await import("./taste-match");

const match: TasteMatchDTO = {
  score: 72,
  components: { scoreSim: 0.7, likedSim: 0.8, tasteSim: null },
  sharedFavorites: [{ mediaType: "movie", id: 1, title: "Arrival", posterPath: null, viewerScore: 9, ownerScore: 10 }],
  fightAbout: [{ mediaType: "movie", id: 2, title: "La La Land", posterPath: null, viewerScore: 3, ownerScore: 9 }],
  evidence: { sharedRated: 7, sharedLiked: 3, hasTaste: false },
};

beforeEach(() => {
  getTasteMatch.mockReset();
  track.mockReset();
  Object.assign(viewer, { resolved: true, authenticated: true, isOwner: false });
});

describe("TasteMatch", () => {
  it.each([
    ["guest", { authenticated: false }],
    ["owner", { isOwner: true }],
    ["unresolved viewer", { resolved: false }],
  ])("renders nothing and never fetches for a %s", (_n, over) => {
    Object.assign(viewer, over);
    const { container } = render(<TasteMatch username="ada" displayName="Ada L" />);
    expect(container.innerHTML).toBe("");
    expect(getTasteMatch).not.toHaveBeenCalled();
  });

  it("renders nothing when the server gate returns null", async () => {
    getTasteMatch.mockResolvedValue(null);
    const { container } = render(<TasteMatch username="ada" displayName="Ada L" />);
    await waitFor(() => expect(getTasteMatch).toHaveBeenCalledWith("ada"));
    expect(container.innerHTML).toBe("");
  });

  it("shows the score, the non-null components, shared loves and disagreements", async () => {
    getTasteMatch.mockResolvedValue(match);
    render(<TasteMatch username="ada" displayName="Ada L" />);
    expect(await screen.findByText("72%")).toBeTruthy();
    expect(screen.getByText("Your taste match with Ada")).toBeTruthy();
    expect(screen.getByText("Based on 7 titles you both rated")).toBeTruthy();
    expect(screen.getAllByRole("meter")).toHaveLength(2); // tasteSim null → no meter
    expect(screen.getByTitle("Arrival")).toBeTruthy();
    expect(screen.getByText("La La Land")).toBeTruthy();
    expect(screen.getByText("4.5")).toBeTruthy(); // owner's 9/10 as stars
    // Fable rule: copy never labels the person.
    expect(document.body.textContent ?? "").not.toMatch(/you're|you are|are a /i);
  });

  it("fires taste_match_view once per target and fetches once, across re-renders", async () => {
    getTasteMatch.mockResolvedValue(match);
    const { rerender } = render(<TasteMatch username="ada" displayName="Ada L" />);
    await screen.findByText("72%");
    rerender(<TasteMatch username="ada" displayName="Ada L" />);
    rerender(<TasteMatch username="ada" displayName="Ada L" />);
    await waitFor(() => expect(track).toHaveBeenCalledTimes(1));
    expect(getTasteMatch).toHaveBeenCalledTimes(1);
    expect(track.mock.calls[0][0]).toMatchObject({ action: "taste_match_view", metadata: { username: "ada" } });
  });
});
