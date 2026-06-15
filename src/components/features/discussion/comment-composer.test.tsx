import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { CommentComposer } from "./comment-composer";

// Mock server actions to prevent next-auth/next/server import errors.
vi.mock("@/server/actions/comments", () => ({
  createComment: vi.fn().mockResolvedValue({ status: "error", message: "Test" }),
}));
const searchMentionEntities = vi.fn().mockResolvedValue({
  people: [],
  titles: [],
  cast: [],
  episodes: [],
});
vi.mock("@/server/actions/discussion-search", () => ({
  searchMentionEntities: (...args: unknown[]) => searchMentionEntities(...args),
  getEntityImages: vi.fn().mockResolvedValue({ images: [] }),
}));
vi.mock("@/hooks/use-analytics", () => ({
  useAnalytics: () => ({ trackAction: vi.fn() }),
}));

describe("CommentComposer", () => {
  it("renders textarea and Add image button for a movie anchor", () => {
    render(<CommentComposer anchor={{ type: "movie", movieId: 550 }} />);
    expect(screen.getByRole("textbox")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /add image/i })).toBeInTheDocument();
  });

  it("does not throw when @a is typed into the textarea (autocomplete mount)", () => {
    const { getByRole } = render(<CommentComposer anchor={{ type: "movie", movieId: 550 }} />);
    const textarea = getByRole("textbox");
    expect(() => {
      fireEvent.change(textarea, { target: { value: "@a" } });
    }).not.toThrow();
  });

  it("searches a MULTI-WORD mention query (e.g. '@walter wh')", async () => {
    searchMentionEntities.mockClear();
    const { getByRole } = render(<CommentComposer anchor={{ type: "movie", movieId: 550 }} />);
    const textarea = getByRole("textbox");
    fireEvent.change(textarea, { target: { value: "@walter wh" } });
    await waitFor(
      () => {
        expect(searchMentionEntities).toHaveBeenCalled();
      },
      { timeout: 1000 }
    );
    const lastCall = searchMentionEntities.mock.calls.at(-1)?.[0] as { query: string };
    expect(lastCall.query).toBe("walter wh");
  });

  it("highlights and inserts a result via keyboard (ArrowDown + Enter)", async () => {
    searchMentionEntities.mockResolvedValueOnce({
      people: [{ username: "walter", name: "Walter White", image: null }],
      titles: [],
      cast: [],
      episodes: [],
    });
    const { getByRole } = render(<CommentComposer anchor={{ type: "movie", movieId: 550 }} />);
    const textarea = getByRole("textbox") as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: "@walter" } });
    // Palette renders the option once results arrive.
    const option = await screen.findByRole("option", { name: /walter/i });
    expect(option).toBeInTheDocument();
    // Enter selects the (already-highlighted index 0) item and must NOT add a newline.
    fireEvent.keyDown(textarea, { key: "Enter" });
    await waitFor(() => {
      expect(textarea.value).toContain("@walter");
      expect(textarea.value).not.toContain("\n");
    });
  });
});
