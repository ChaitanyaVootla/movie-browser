import { describe, expect, it, vi, afterEach } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { GHOST_CLICK_WINDOW_MS, useGhostClickGuard } from "./use-ghost-click-guard";

function Harness({ open, onLink }: { open: boolean; onLink: () => void }) {
  const guard = useGhostClickGuard(open);
  return (
    <div {...guard}>
      <a
        href="#title"
        onClick={(e) => {
          e.preventDefault();
          onLink();
        }}
      >
        art
      </a>
    </div>
  );
}

afterEach(() => vi.useRealTimers());

describe("useGhostClickGuard", () => {
  it("swallows the click the long-press finger fires on release (no new pointerdown)", () => {
    const onLink = vi.fn();
    const { rerender } = render(<Harness open={false} onLink={onLink} />);
    rerender(<Harness open onLink={onLink} />);
    fireEvent.click(screen.getByText("art"));
    expect(onLink).not.toHaveBeenCalled();
  });

  it("lets a real tap through (pointerdown inside the drawer first)", () => {
    const onLink = vi.fn();
    const { rerender } = render(<Harness open={false} onLink={onLink} />);
    rerender(<Harness open onLink={onLink} />);
    const link = screen.getByText("art");
    fireEvent.pointerDown(link);
    fireEvent.click(link);
    expect(onLink).toHaveBeenCalledTimes(1);
  });

  it("only guards one click: a second pointer-less click goes through", () => {
    const onLink = vi.fn();
    const { rerender } = render(<Harness open={false} onLink={onLink} />);
    rerender(<Harness open onLink={onLink} />);
    const link = screen.getByText("art");
    fireEvent.click(link);
    fireEvent.click(link);
    expect(onLink).toHaveBeenCalledTimes(1);
  });

  it("expires, so keyboard activation later is never blocked", () => {
    vi.useFakeTimers();
    const onLink = vi.fn();
    const { rerender } = render(<Harness open={false} onLink={onLink} />);
    rerender(<Harness open onLink={onLink} />);
    vi.advanceTimersByTime(GHOST_CLICK_WINDOW_MS + 1);
    fireEvent.click(screen.getByText("art"));
    expect(onLink).toHaveBeenCalledTimes(1);
  });

  it("re-arms on every open", () => {
    const onLink = vi.fn();
    const { rerender } = render(<Harness open={false} onLink={onLink} />);
    rerender(<Harness open onLink={onLink} />);
    fireEvent.click(screen.getByText("art"));
    rerender(<Harness open={false} onLink={onLink} />);
    rerender(<Harness open onLink={onLink} />);
    fireEvent.click(screen.getByText("art"));
    expect(onLink).not.toHaveBeenCalled();
  });
});
