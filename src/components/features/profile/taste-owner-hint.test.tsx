import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const viewer = { resolved: true, isOwner: true, refreshProfile: vi.fn(async () => {}) };
vi.mock("./profile-viewer-context", () => ({ useProfileViewer: () => viewer }));
vi.mock("./taste/calibration-host", () => ({
  CalibrationHost: ({
    open,
    onComplete,
  }: {
    open: boolean;
    onComplete?: (r: { positives: number; ready: boolean }) => void;
  }) =>
    open ? (
      <button type="button" onClick={() => onComplete?.({ positives: 4, ready: true })}>
        finish deck
      </button>
    ) : null,
}));

const { TasteOwnerHint } = await import("./taste-owner-hint");

afterEach(cleanup);
beforeEach(() => {
  Object.assign(viewer, { resolved: true, isOwner: true });
  viewer.refreshProfile.mockClear();
});

const insufficient = { status: "insufficient" as const, positiveCount: 7, needed: 10 };

describe("TasteOwnerHint", () => {
  it("renders nothing for visitors, unresolved viewers, or a ready profile", () => {
    for (const over of [{ isOwner: false }, { resolved: false }]) {
      Object.assign(viewer, { resolved: true, isOwner: true }, over);
      const { container } = render(<TasteOwnerHint taste={insufficient} />);
      expect(container.innerHTML).toBe("");
      cleanup();
    }
    Object.assign(viewer, { resolved: true, isOwner: true });
    const { container } = render(<TasteOwnerHint taste={{ status: "hidden" }} />);
    expect(container.textContent).toContain("hidden from visitors");
  });

  it("hosts the calibration deck and re-pulls the owner-fresh profile on completion", () => {
    render(<TasteOwnerHint taste={insufficient} />);
    expect(screen.getByText(/7 of 10/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Rate 10 titles now" }));
    fireEvent.click(screen.getByRole("button", { name: "finish deck" }));
    expect(viewer.refreshProfile).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("status").textContent).toContain("Ratings saved");
    expect(document.body.textContent ?? "").not.toMatch(/you're|you are|are a /i);
  });
});
