import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { CommentComposer } from "./comment-composer";

// Mock server actions to prevent next-auth/next/server import errors.
vi.mock("@/server/actions/comments", () => ({
  createComment: vi.fn().mockResolvedValue({ status: "error", message: "Test" }),
}));
vi.mock("@/server/actions/discussion-search", () => ({
  searchMentionEntities: vi.fn().mockResolvedValue({ people: [], titles: [], cast: [], episodes: [] }),
  getEntityImages: vi.fn().mockResolvedValue({ images: [] }),
}));
vi.mock("@/hooks/use-analytics", () => ({
  useAnalytics: () => ({ trackAction: vi.fn() }),
}));

describe("CommentComposer", () => {
  it("renders textarea and Add image button for a movie anchor", () => {
    render(
      <CommentComposer
        anchor={{ type: "movie", movieId: 550 }}
      />
    );
    expect(screen.getByRole("textbox")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /add image/i })).toBeInTheDocument();
  });

  it("does not throw when @a is typed into the textarea (autocomplete mount)", () => {
    const { getByRole } = render(
      <CommentComposer anchor={{ type: "movie", movieId: 550 }} />
    );
    const textarea = getByRole("textbox");
    expect(() => {
      fireEvent.change(textarea, { target: { value: "@a" } });
    }).not.toThrow();
  });
});
