import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { LiteYouTube } from "./lite-youtube";

describe("LiteYouTube", () => {
  it("renders a click-to-load facade (button/thumbnail), NOT a raw iframe, before interaction", () => {
    const { container } = render(<LiteYouTube id="dQw4w9WgXcQ" title="Trailer" />);
    // No iframe in the DOM until the user clicks (facade contract).
    expect(container.querySelector("iframe")).toBeNull();
    // The accessible play affordance is present.
    expect(screen.getByRole("button")).toBeTruthy();
  });
});
