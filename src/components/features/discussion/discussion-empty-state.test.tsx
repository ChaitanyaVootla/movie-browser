import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { DiscussionEmptyState } from "./discussion-empty-state";

afterEach(cleanup);

describe("DiscussionEmptyState", () => {
  it("falls back to static editorial prompts when no AI starters are given", () => {
    render(<DiscussionEmptyState starters={[]} onPick={vi.fn()} signedIn />);
    // Static fallback set — must NOT require any AI call.
    expect(screen.getByText("What did you think of the ending?")).toBeTruthy();
    expect(screen.getByText("Best scene?")).toBeTruthy();
    expect(screen.getByText("Overrated or underrated?")).toBeTruthy();
  });

  it("prefers AI starters (capped at 4) over the fallback", () => {
    const starters = ["Q1", "Q2", "Q3", "Q4", "Q5"];
    render(<DiscussionEmptyState starters={starters} onPick={vi.fn()} signedIn />);
    expect(screen.getByText("Q1")).toBeTruthy();
    expect(screen.getByText("Q4")).toBeTruthy();
    expect(screen.queryByText("Q5")).toBeNull();
    // Fallback must not leak through when AI prompts exist.
    expect(screen.queryByText("Best scene?")).toBeNull();
  });

  it("seeds the composer with the picked prompt", () => {
    const onPick = vi.fn();
    render(<DiscussionEmptyState starters={["Why this title?"]} onPick={onPick} signedIn />);
    fireEvent.click(screen.getByText("Why this title?"));
    expect(onPick).toHaveBeenCalledWith("Why this title?");
  });

  it("shows sign-in framing when the viewer is anonymous", () => {
    render(<DiscussionEmptyState starters={[]} onPick={vi.fn()} signedIn={false} />);
    expect(screen.getByText(/Sign in to be the first/i)).toBeTruthy();
  });

  it("renders web reactions when trailer comments exist, nothing when absent", () => {
    const { container, rerender } = render(
      <DiscussionEmptyState
        starters={[]}
        onPick={vi.fn()}
        signedIn
        webReactionsRaw={[{ text: "loved this trailer", author: "viewer", likeCount: 12 }]}
      />,
    );
    expect(screen.getByText("loved this trailer")).toBeTruthy();
    rerender(<DiscussionEmptyState starters={[]} onPick={vi.fn()} signedIn webReactionsRaw={null} />);
    expect(container.textContent).not.toContain("Reactions from the web");
  });
});
