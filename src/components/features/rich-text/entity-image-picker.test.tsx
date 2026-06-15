import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { EntityImagePicker } from "./entity-image-picker";

const getEntityImages = vi.fn().mockResolvedValue({ images: [] });
const searchMentionEntities = vi.fn().mockResolvedValue({
  people: [],
  titles: [],
  cast: [],
  episodes: [],
});
vi.mock("@/server/actions/discussion-search", () => ({
  getEntityImages: (...args: unknown[]) => getEntityImages(...args),
  searchMentionEntities: (...args: unknown[]) => searchMentionEntities(...args),
}));

describe("EntityImagePicker", () => {
  it("renders ONLY inner content (search box + grid) — no self-rendered header/close X", async () => {
    render(
      <EntityImagePicker
        anchor={{ type: "movie", movieId: 550 }}
        onSelect={vi.fn()}
        onClose={vi.fn()}
      />
    );
    // The Dialog (not this component) owns the "Pick an image" title + close button.
    expect(screen.queryByText(/pick an image/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /close image picker/i })).not.toBeInTheDocument();
    // It DOES render the entity search box.
    expect(screen.getByRole("textbox", { name: /search for an entity/i })).toBeInTheDocument();
  });

  it("loads the anchor's images on mount", async () => {
    getEntityImages.mockClear();
    render(
      <EntityImagePicker
        anchor={{ type: "movie", movieId: 550 }}
        onSelect={vi.fn()}
        onClose={vi.fn()}
      />
    );
    await waitFor(() => {
      expect(getEntityImages).toHaveBeenCalledWith({ entityType: "movie", tmdbId: 550 });
    });
  });

  it("searches other entities when the user types", async () => {
    searchMentionEntities.mockClear();
    render(
      <EntityImagePicker
        anchor={{ type: "movie", movieId: 550 }}
        onSelect={vi.fn()}
        onClose={vi.fn()}
      />
    );
    const search = screen.getByRole("textbox", { name: /search for an entity/i });
    fireEvent.change(search, { target: { value: "matrix" } });
    await waitFor(
      () => {
        expect(searchMentionEntities).toHaveBeenCalled();
      },
      { timeout: 1000 }
    );
  });
});
