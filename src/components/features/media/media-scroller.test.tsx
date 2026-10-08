/**
 * Regression test: MediaScroller's desktop arrow buttons must scroll the row.
 *
 * BUG (found Oct 2026): MediaScroller called a SECOND `useScrollDrag()` just to
 * get `scroll()`. That instance's internal ref was never attached to any
 * element (the real scroll div lives inside ScrollContainer), so `scroll()`
 * read `null` and the chevrons were silent no-ops on every carousel.
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/hooks/use-analytics", () => ({
  useAnalytics: () => ({ trackAction: vi.fn() }),
}));

import { MediaScroller } from "./media-scroller";

afterEach(cleanup);

describe("MediaScroller arrow controls", () => {
  it("scrolls the row when the right/left arrows are clicked", () => {
    const scrollBy = vi.fn();
    Object.defineProperty(HTMLElement.prototype, "scrollBy", {
      configurable: true,
      value: scrollBy,
    });

    render(
      <MediaScroller title="Trending">
        <a href="#one" data-testid="item">
          one
        </a>
      </MediaScroller>
    );

    fireEvent.click(screen.getByRole("button", { name: "Scroll right" }));
    fireEvent.click(screen.getByRole("button", { name: "Scroll left" }));

    expect(scrollBy).toHaveBeenCalledTimes(2);
    // Called on the actual scroll element (the card's parent).
    expect(scrollBy.mock.contexts[0]).toBe(screen.getByTestId("item").parentElement);
  });
});
