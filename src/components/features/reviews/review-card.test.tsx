import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { ReviewDTO } from "@/types/social";
import { ReviewCard } from "./review-card";

// The client like button pulls in next-auth + a server action (→ next/server,
// which jsdom/happy-dom can't load). Stub the boundaries so the card renders.
vi.mock("@/server/actions/review-reactions", () => ({
  toggleReviewLike: vi.fn().mockResolvedValue({ ok: true, liked: true, likeCount: 1 }),
}));
vi.mock("next-auth/react", () => ({ useSession: () => ({ status: "unauthenticated" }) }));
vi.mock("@/hooks/use-analytics", () => ({ useAnalytics: () => ({ trackAction: vi.fn() }) }));
vi.mock("@/components/features/auth", () => ({ useLoginDialog: () => ({ openLoginDialog: vi.fn() }) }));

const sample: ReviewDTO = {
  id: 42,
  username: "cinephile_ada",
  displayName: "Ada",
  avatarUrl: null,
  title: "A masterpiece",
  score: 8,
  liked: true,
  body: "Loved every minute of it.",
  spoilerScope: "NONE",
  scopeSeason: null,
  scopeEpisode: null,
  images: [],
  seasonNumber: null,
  likeCount: 3,
  likedByViewer: false,
  createdAt: "2026-06-15T00:00:00.000Z",
  editedAt: null,
};

describe("ReviewCard", () => {
  it("renders title, body, star display and the like button", () => {
    render(<ReviewCard review={sample} />);
    expect(screen.getByText("A masterpiece")).toBeTruthy();
    expect(screen.getByText("Loved every minute of it.")).toBeTruthy();
    // Read-only star display exposes an aria-label.
    expect(screen.getByLabelText(/of 5 stars/i)).toBeTruthy();
    // Like button present (viewer not yet liked → "Like review").
    expect(screen.getByLabelText("Like review")).toBeTruthy();
  });
});
