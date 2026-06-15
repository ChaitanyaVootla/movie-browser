import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { CommentComposer } from "./comment-composer";

// Mock server actions to prevent next-auth/next/server import errors.
vi.mock("@/server/actions/comments", () => ({
  createComment: vi.fn().mockResolvedValue({ status: "error", message: "Test" }),
}));
vi.mock("@/server/actions/catalog-search", () => ({
  searchMentionEntities: vi.fn().mockResolvedValue({ people: [], titles: [], cast: [], episodes: [] }),
  getEntityImages: vi.fn().mockResolvedValue({ images: [] }),
}));
vi.mock("@/hooks/use-analytics", () => ({
  useAnalytics: () => ({ trackAction: vi.fn() }),
}));

// NOTE: the rich @-mention CHIP flow, single-Backspace chip deletion, and the
// `:emoji` shortcode popup run on ProseMirror's contenteditable, which jsdom
// cannot faithfully simulate — those are verified in-browser via Playwright.
// The load-bearing serialization contract (chips → tokens, emoji → unicode, no
// spurious newlines) is unit-tested in rich-text/serialize.test.ts. Here we
// only assert the composer's structural toolbar renders for the new editor.
describe("CommentComposer (Tiptap)", () => {
  it("renders the editor surface plus Add image, Emoji and Post controls", () => {
    render(<CommentComposer anchor={{ type: "movie", movieId: 550 }} />);
    // The Tiptap ProseMirror editable surface mounts (contenteditable div).
    expect(document.querySelector(".ProseMirror")).toBeTruthy();
    expect(screen.getByRole("button", { name: /add image/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /add emoji/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /mark as spoiler/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^post$/i })).toBeInTheDocument();
  });

  it("disables Post when the editor is empty", () => {
    render(<CommentComposer anchor={{ type: "movie", movieId: 550 }} />);
    expect(screen.getByRole("button", { name: /^post$/i })).toBeDisabled();
  });

  it("renders a Cancel button only when onCancel is provided", () => {
    const { rerender } = render(<CommentComposer anchor={{ type: "movie", movieId: 550 }} />);
    expect(screen.queryByRole("button", { name: /cancel/i })).not.toBeInTheDocument();
    rerender(<CommentComposer anchor={{ type: "movie", movieId: 550 }} onCancel={() => {}} />);
    expect(screen.getByRole("button", { name: /cancel/i })).toBeInTheDocument();
  });
});
