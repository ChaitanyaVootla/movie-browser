import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ getCalibrationDeck: vi.fn(), submitCalibration: vi.fn() }));
vi.mock("@/server/actions/taste-calibration", () => h);
vi.mock("@/hooks/use-analytics", () => ({ useAnalytics: () => ({ trackAction: vi.fn() }) }));
vi.mock("next/image", () => ({ default: () => null }));

import { TasteCalibrationDeck } from "./calibration-deck";

const item = (id: number) => ({ mediaType: "movie" as const, id, title: `Film ${id}`, year: 2000, posterPath: null, genres: [] });

beforeEach(() => {
  h.getCalibrationDeck.mockResolvedValue({ items: [item(1), item(2), item(3), item(4)] });
  // A real write takes a moment — long enough for the buttons to render disabled.
  h.submitCalibration.mockImplementation(() => new Promise((r) => setTimeout(() => r({ positives: 0, ready: false }), 20)));
  window.matchMedia = ((q: string) => ({ matches: q.includes("reduce"), media: q, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia;
});

describe("TasteCalibrationDeck keyboard", () => {
  it("after a button answer, focus stays in the deck so the arrow keys keep working", async () => {
    // Chrome drops focus from a button that becomes disabled; jsdom does not
    // (and its blur() is a no-op there), so move focus out to simulate it.
    const outside = document.body.appendChild(document.createElement("button"));
    const ob = new MutationObserver(() => {
      const a = document.activeElement as HTMLButtonElement | null;
      if (a?.disabled) outside.focus();
    });
    ob.observe(document.body, { subtree: true, attributes: true, attributeFilter: ["disabled"] });
    render(<TasteCalibrationDeck mode="start" />);
    const liked = await screen.findByRole("button", { name: /Liked it/ });
    liked.focus();
    await act(async () => fireEvent.click(liked));
    await screen.findByText("Film 2");
    const deck = screen.getByRole("group", { name: "Rate titles to start your taste profile" });
    expect(deck.contains(document.activeElement)).toBe(true);
    await act(async () => fireEvent.keyDown(document.activeElement as Element, { key: "ArrowUp" }));
    await waitFor(() => expect(screen.getByText("Film 3")).toBeTruthy());
    ob.disconnect();
    expect(h.submitCalibration).toHaveBeenLastCalledWith({ answers: [{ mediaType: "movie", id: 2, answer: "loved" }] });
  });
});
