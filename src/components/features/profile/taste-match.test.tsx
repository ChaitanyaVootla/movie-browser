import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { TasteMatchDTO } from "@/lib/taste/recommend-types";

const viewer = { resolved: true, authenticated: true, isOwner: false };
vi.mock("./profile-viewer-context", () => ({ useProfileViewer: () => viewer }));
const track = vi.fn();
// A NEW function per render, like the real hook while the session settles.
vi.mock("@/hooks/use-analytics", () => ({ useAnalytics: () => ({ trackAction: (...a: unknown[]) => track(...a) }) }));
const getTasteMatch = vi.fn();
vi.mock("@/server/actions/taste-recs", () => ({ getTasteMatch: (u: string) => getTasteMatch(u) }));
vi.mock("@/server/actions/taste-explore", () => ({ getViewerTasteAxes: vi.fn() }));
vi.mock("./follow-button", () => ({ FollowButton: () => <button type="button">Follow</button> }));
const cueEvents: unknown[] = [];
if (typeof window !== "undefined") window.addEventListener("ai-chat-trigger", (e) => cueEvents.push((e as CustomEvent).detail));

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

  it("shows the score, ONE segmented bar summing to it, shared loves and disagreements", async () => {
    getTasteMatch.mockResolvedValue(match);
    render(<TasteMatch username="ada" displayName="Ada L" />);
    expect(await screen.findByText("72%")).toBeTruthy();
    expect(screen.getByText("Your taste match with Ada")).toBeTruthy();
    expect(screen.getByText("7 titles both rated · 3 shared loves")).toBeTruthy();
    const meters = screen.getAllByRole("meter");
    expect(meters).toHaveLength(1);
    expect(meters[0].getAttribute("aria-valuenow")).toBe("72");
    // segments (weighted contributions) add up to the headline, tasteSim null → 2 segments
    const widths = Array.from(meters[0].children).map((el) => parseFloat((el as HTMLElement).style.width));
    expect(widths).toHaveLength(2);
    expect(Math.round(widths.reduce((a, b) => a + b, 0))).toBe(Math.round(((0.7 * 0.5 + 0.8 * 0.3) / 0.8) * 100));
    expect(screen.queryByText(/Overall taste/)).toBeNull();
    expect(screen.getByTitle("Arrival")).toBeTruthy();
    expect(screen.getByText("La La Land")).toBeTruthy();
    expect(screen.getByText("4.5")).toBeTruthy(); // owner's 9/10 as stars
    // Fable rule: copy never labels the person.
    expect(document.body.textContent ?? "").not.toMatch(/you're|you are|are a /i);
  });

  it("CTAs: Follow + Cue 'find something for both of us' with the right message", async () => {
    getTasteMatch.mockResolvedValue(match);
    render(<TasteMatch username="ada" displayName="Ada L" />);
    await screen.findByText("72%");
    expect(screen.getByRole("button", { name: "Follow" })).toBeTruthy();
    cueEvents.length = 0;
    fireEvent.click(screen.getByRole("button", { name: /Find something for both of us/ }));
    expect(cueEvents[0]).toMatchObject({ message: "Find something Ada and I would both enjoy tonight" });
    // the "How it adds up" line exposes the honest component numbers
    fireEvent.click(screen.getByRole("button", { name: "How it adds up" }));
    expect(screen.getByText(/Ratings agree 70% · Shared loves 80%/)).toBeTruthy();
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
