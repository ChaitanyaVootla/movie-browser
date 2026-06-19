import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { HubThreadCard } from "./hub-thread-card";
import type { HubThreadCard as Card } from "@/server/db/postgres/social/discussion-hub";

const card: Card = {
  id: 1,
  body: "Best heist of the decade, change my mind.",
  likeCount: 12,
  createdAt: "2026-06-14T10:00:00.000Z",
  anchor: { type: "movie", title: "Heat", posterPath: "/heat.jpg" },
  href: "/movie/949/discussions",
  isCue: false,
  author: { id: 5, username: "neo", name: "Neo", image: null },
};

describe("HubThreadCard", () => {
  it("links to the discussion permalink and shows the title", () => {
    render(<HubThreadCard card={card} />);
    const link = screen.getByRole("link");
    expect(link).toHaveAttribute("href", "/movie/949/discussions");
    expect(screen.getByText("Heat")).toBeInTheDocument();
  });

  it("renders an AI badge for Cue cards", () => {
    render(<HubThreadCard card={{ ...card, isCue: true, author: { id: 1, username: "cue", name: "Cue", image: null } }} />);
    expect(screen.getByText(/AI/)).toBeInTheDocument();
  });
});
