/**
 * The desktop hover card (one big <Link>) opens over a carousel row after a
 * 1s rest. Pressing on it to drag the row must dismiss it without opening the
 * title; a plain click must still open the title.
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { usePressDragDismiss } from "./use-press-drag-dismiss";

afterEach(cleanup);

function Overlay({ onDismiss, onLink }: { onDismiss: () => void; onLink: () => void }) {
  const handlers = usePressDragDismiss(onDismiss);
  return (
    <div {...handlers} data-testid="overlay">
      <a href="#title" data-testid="link" onClick={onLink}>
        title
      </a>
    </div>
  );
}

const mouse = { pointerType: "mouse", button: 0, pointerId: 1 } as const;

describe("usePressDragDismiss", () => {
  it("dismisses and swallows the release click when the press drags", () => {
    const onDismiss = vi.fn();
    const onLink = vi.fn();
    render(<Overlay onDismiss={onDismiss} onLink={onLink} />);
    const link = screen.getByTestId("link");

    fireEvent.pointerDown(link, { ...mouse, clientX: 300, clientY: 100 });
    fireEvent.pointerMove(link, { ...mouse, buttons: 1, clientX: 260, clientY: 100 });
    fireEvent.pointerUp(link, { ...mouse, clientX: 260, clientY: 100 });
    const notCancelled = fireEvent.click(link, { detail: 1 });

    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(onLink).not.toHaveBeenCalled();
    expect(notCancelled).toBe(false);
  });

  it("lets a plain click open the title", () => {
    const onDismiss = vi.fn();
    const onLink = vi.fn();
    render(<Overlay onDismiss={onDismiss} onLink={onLink} />);
    const link = screen.getByTestId("link");

    fireEvent.pointerDown(link, { ...mouse, clientX: 300, clientY: 100 });
    fireEvent.pointerMove(link, { ...mouse, buttons: 1, clientX: 302, clientY: 101 });
    fireEvent.pointerUp(link, { ...mouse, clientX: 302, clientY: 101 });
    fireEvent.click(link, { detail: 1 });

    expect(onDismiss).not.toHaveBeenCalled();
    expect(onLink).toHaveBeenCalledTimes(1);
  });

  it("blocks native link drag (ghost image) off the card", () => {
    render(<Overlay onDismiss={vi.fn()} onLink={vi.fn()} />);
    expect(fireEvent.dragStart(screen.getByTestId("link"))).toBe(false);
  });
});
