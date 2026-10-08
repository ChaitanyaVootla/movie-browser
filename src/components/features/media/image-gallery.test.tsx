/**
 * The image-gallery lightbox is a hand-rolled full-screen overlay. It must
 * behave like a modal dialog: Back-button dismiss on mobile (useHistoryDismiss,
 * see pwa-mobile.md), focus moved in on open and restored on close, Tab
 * trapped inside, and labelled icon buttons. Before Oct 2026 it had none of
 * these: mobile Back navigated the page BEHIND the open lightbox, and keyboard
 * focus stayed on a thumbnail hidden under it.
 */
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/hooks/use-analytics", () => ({ useAnalytics: () => ({ trackAction: vi.fn() }) }));
const historyDismiss = vi.fn();
vi.mock("@/hooks/use-history-dismiss", () => ({
  useHistoryDismiss: (open: boolean, onClose: () => void) => historyDismiss(open, onClose),
}));

import { ImageGallery } from "./image-gallery";

afterEach(() => {
  cleanup();
  historyDismiss.mockClear();
});

const IMAGES = [1, 2, 3].map((i) => ({
  file_path: `/img${i}.jpg`,
  aspect_ratio: 1.78,
  width: 1920,
  height: 1080,
}));

function openFirst() {
  render(<ImageGallery images={IMAGES} title="Photos" />);
  const thumb = screen
    .getAllByRole("button")
    .find((b) => b.querySelector('img[alt="Gallery image 1"]'));
  if (!thumb) throw new Error("thumbnail not found");
  thumb.focus();
  fireEvent.click(thumb);
  return thumb;
}

describe("ImageGallery lightbox", () => {
  it("opens as a labelled modal dialog with focus on Close", () => {
    openFirst();
    const dialog = screen.getByRole("dialog");
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(screen.getByRole("button", { name: "Close gallery" })).toBe(document.activeElement);
    expect(screen.getByRole("button", { name: "Next image" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Previous image" })).toBeTruthy();
  });

  it("registers with useHistoryDismiss so mobile Back closes it", () => {
    openFirst();
    const lastCall = historyDismiss.mock.calls.at(-1);
    expect(lastCall?.[0]).toBe(true);
    act(() => (lastCall?.[1] as () => void)());
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("restores focus to the opening thumbnail on Escape", () => {
    const thumb = openFirst();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(thumb);
  });
});
