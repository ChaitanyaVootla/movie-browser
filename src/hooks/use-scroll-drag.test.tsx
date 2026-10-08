/**
 * Regression test: releasing a mouse drag on a horizontal scroller must NOT
 * activate the card under the cursor.
 *
 * BUG (user report, Oct 2026): "I can click and drag with the mouse to scroll
 * the horizontal scroller, but many times when I release the drag it opens the
 * last item the mouse is on." Cause: `useScrollDrag` measured a 5px threshold
 * and scrolled, but never suppressed the `click` the browser synthesises after
 * mouseup. Whenever pointerdown and pointerup landed on the same card (a short
 * drag, or any browser that targets the click by hit-test rather than the
 * capture target) the card's <Link> navigated.
 *
 * Fix: after a real drag (past the threshold) the hook swallows the next click
 * in the CAPTURE phase on the scroller, so no descendant handler (Next <Link>,
 * gallery button, hover-card wrapper) ever sees it.
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ScrollContainer } from "@/components/features/media/scroll-container";

afterEach(cleanup);

function renderScroller(onItemClick: (e: React.MouseEvent) => void) {
  render(
    <ScrollContainer showControls={false}>
      <a href="#one" data-testid="one" onClick={onItemClick}>
        one
      </a>
      <a href="#two" data-testid="two" onClick={onItemClick}>
        two
      </a>
    </ScrollContainer>
  );
  const item = screen.getByTestId("one");
  const scroller = item.parentElement as HTMLElement;
  return { item, scroller };
}

const mouse = { pointerType: "mouse", button: 0, pointerId: 1 } as const;

/** Mouse drag that starts and ends on `item`, moving `dx` px horizontally. */
function dragOn(item: HTMLElement, dx: number) {
  fireEvent.pointerDown(item, { ...mouse, clientX: 200, clientY: 50 });
  fireEvent.pointerMove(item, { ...mouse, buttons: 1, clientX: 200 + dx / 2, clientY: 50 });
  fireEvent.pointerMove(item, { ...mouse, buttons: 1, clientX: 200 + dx, clientY: 50 });
  fireEvent.pointerUp(item, { ...mouse, clientX: 200 + dx, clientY: 50 });
  // The browser then dispatches a click on the common ancestor (the card).
  return fireEvent.click(item, { button: 0, detail: 1, clientX: 200 + dx, clientY: 50 });
}

describe("useScrollDrag click suppression", () => {
  it("swallows the click that follows a real mouse drag", () => {
    const onItemClick = vi.fn();
    const { item } = renderScroller(onItemClick);

    const notCancelled = dragOn(item, -60);

    expect(onItemClick).not.toHaveBeenCalled();
    // preventDefault is what stops the native <a href> navigation.
    expect(notCancelled).toBe(false);
  });

  it("still lets a plain click (no movement) through", () => {
    const onItemClick = vi.fn();
    const { item } = renderScroller(onItemClick);

    fireEvent.pointerDown(item, { ...mouse, clientX: 200, clientY: 50 });
    fireEvent.pointerUp(item, { ...mouse, clientX: 200, clientY: 50 });
    const notCancelled = fireEvent.click(item, { button: 0, detail: 1 });

    expect(onItemClick).toHaveBeenCalledTimes(1);
    expect(notCancelled).toBe(true);
  });

  it("treats sub-threshold jitter (<= 5px) as a click", () => {
    const onItemClick = vi.fn();
    const { item } = renderScroller(onItemClick);

    dragOn(item, 4);

    expect(onItemClick).toHaveBeenCalledTimes(1);
  });

  it("only suppresses ONE click — the next plain click works", () => {
    const onItemClick = vi.fn();
    const { item } = renderScroller(onItemClick);

    dragOn(item, -60);
    expect(onItemClick).not.toHaveBeenCalled();

    fireEvent.pointerDown(item, { ...mouse, clientX: 200, clientY: 50 });
    fireEvent.pointerUp(item, { ...mouse, clientX: 200, clientY: 50 });
    fireEvent.click(item, { button: 0, detail: 1 });
    expect(onItemClick).toHaveBeenCalledTimes(1);
  });

  it("does not eat a keyboard activation (Enter) right after a drag", () => {
    const onItemClick = vi.fn();
    const { item } = renderScroller(onItemClick);

    // Drag released outside any card → the browser fires no click at all, so a
    // stale "suppress" flag must not linger and eat the next keyboard click.
    fireEvent.pointerDown(item, { ...mouse, clientX: 200, clientY: 50 });
    fireEvent.pointerMove(item, { ...mouse, buttons: 1, clientX: 120, clientY: 50 });
    fireEvent.pointerUp(item, { ...mouse, clientX: 120, clientY: 50 });
    // Keyboard-synthesised click: detail === 0.
    fireEvent.click(item, { detail: 0 });

    expect(onItemClick).toHaveBeenCalledTimes(1);
  });

  it("ignores touch pointers entirely (native scroll owns touch)", () => {
    const onItemClick = vi.fn();
    const { item, scroller } = renderScroller(onItemClick);
    const before = scroller.scrollLeft;

    const touch = { pointerType: "touch", pointerId: 2, isPrimary: true } as const;
    fireEvent.pointerDown(item, { ...touch, clientX: 200, clientY: 50 });
    fireEvent.pointerMove(item, { ...touch, clientX: 100, clientY: 50 });
    fireEvent.pointerUp(item, { ...touch, clientX: 100, clientY: 50 });
    fireEvent.click(item, { detail: 1 });

    expect(scroller.scrollLeft).toBe(before);
    expect(onItemClick).toHaveBeenCalledTimes(1);
  });

  it("never starts a drag from a middle-button press (open-in-new-tab)", () => {
    const onItemClick = vi.fn();
    const { item, scroller } = renderScroller(onItemClick);

    fireEvent.pointerDown(item, { ...mouse, button: 1, clientX: 200, clientY: 50 });
    fireEvent.pointerMove(item, { ...mouse, button: -1, buttons: 4, clientX: 100, clientY: 50 });
    fireEvent.pointerUp(item, { ...mouse, button: 1, clientX: 100, clientY: 50 });

    expect(scroller.className).not.toContain("cursor-grabbing");
  });

  it("blocks native link/image drag inside the scroller", () => {
    const { item } = renderScroller(vi.fn());
    const notCancelled = fireEvent.dragStart(item);
    expect(notCancelled).toBe(false);
  });
});
