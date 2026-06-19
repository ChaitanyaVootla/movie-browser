import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { DiscussionEmptyState } from "./discussion-empty-state";

afterEach(cleanup);

describe("DiscussionEmptyState", () => {
  it("always renders the static prompt set regardless of starters prop", () => {
    render(<DiscussionEmptyState onPick={vi.fn()} signedIn />);
    // Static set — must NOT require any AI call.
    expect(screen.getByText("What did you think of the ending?")).toBeTruthy();
    expect(screen.getByText("Best scene or moment?")).toBeTruthy();
    expect(screen.getByText("Overrated or underrated?")).toBeTruthy();
  });

  it("ignores any AI-sourced starters passed via the prop and always shows the static set", () => {
    const aiStarters = ["Q1", "Q2", "Q3", "Q4", "Q5"];
    render(<DiscussionEmptyState starters={aiStarters} onPick={vi.fn()} signedIn />);
    // AI prompts must NOT appear.
    expect(screen.queryByText("Q1")).toBeNull();
    // Static set must always be shown.
    expect(screen.getByText("What did you think of the ending?")).toBeTruthy();
    expect(screen.getByText("Best scene or moment?")).toBeTruthy();
  });

  it("seeds the composer with the picked static prompt", () => {
    const onPick = vi.fn();
    render(<DiscussionEmptyState onPick={onPick} signedIn />);
    fireEvent.click(screen.getByText("What did you think of the ending?"));
    expect(onPick).toHaveBeenCalledWith("What did you think of the ending?");
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
