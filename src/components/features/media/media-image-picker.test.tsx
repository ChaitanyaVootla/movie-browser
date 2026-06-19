import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MediaImagePicker } from "./media-image-picker";

const getPickerImages = vi.fn().mockResolvedValue({
  backdrops: [],
  posters: [],
  logos: [],
  profiles: [],
  stills: [],
});
const searchImageEntities = vi.fn().mockResolvedValue([]);
vi.mock("@/server/actions/image-picker", () => ({
  getPickerImages: (...args: unknown[]) => getPickerImages(...args),
  searchImageEntities: (...args: unknown[]) => searchImageEntities(...args),
}));

describe("MediaImagePicker", () => {
  it("loads the anchor's images when opened", async () => {
    getPickerImages.mockClear();
    render(
      <MediaImagePicker
        open
        onOpenChange={vi.fn()}
        anchor={{ type: "movie", movieId: 550 }}
        onPick={vi.fn()}
      />
    );
    await waitFor(() => {
      expect(getPickerImages).toHaveBeenCalledWith(
        expect.objectContaining({ entityType: "movie", tmdbId: 550 })
      );
    });
  });

  it("renders the entity search box", () => {
    render(
      <MediaImagePicker open onOpenChange={vi.fn()} anchor={{ type: "movie", movieId: 550 }} onPick={vi.fn()} />
    );
    expect(
      screen.getByRole("textbox", { name: /search for a title or person/i })
    ).toBeInTheDocument();
  });

  it("searches the catalog when the user types", async () => {
    searchImageEntities.mockClear();
    render(
      <MediaImagePicker open onOpenChange={vi.fn()} anchor={{ type: "movie", movieId: 550 }} onPick={vi.fn()} />
    );
    const search = screen.getByRole("textbox", { name: /search for a title or person/i });
    fireEvent.change(search, { target: { value: "matrix" } });
    await waitFor(() => expect(searchImageEntities).toHaveBeenCalledWith("matrix"), { timeout: 1000 });
  });

  it("does not fetch while closed", () => {
    getPickerImages.mockClear();
    render(
      <MediaImagePicker open={false} onOpenChange={vi.fn()} anchor={{ type: "movie", movieId: 550 }} onPick={vi.fn()} />
    );
    expect(getPickerImages).not.toHaveBeenCalled();
  });
});
