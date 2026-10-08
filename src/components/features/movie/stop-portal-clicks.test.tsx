/**
 * Regression test: a click inside a dialog opened from a card's action buttons
 * must NOT activate the card's <Link>.
 *
 * BUG (found Oct 2026): MovieCardActions sits inside the card <Link>; its
 * quick-log Dialog/Drawer and save-to-list Popover are React portals. React
 * bubbles portal events through the React tree, so clicking the note field or
 * a star in the "Log to diary" dialog reached the Link's onClick and navigated
 * to the title page mid-form.
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createPortal } from "react-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { stopPortalClicks } from "./stop-portal-clicks";

afterEach(cleanup);

function Card({ onLinkClick, guarded }: { onLinkClick: () => void; guarded: boolean }) {
  return (
    <a href="#one" onClick={onLinkClick}>
      <div onClick={guarded ? stopPortalClicks : undefined}>
        <span data-testid="inside">gap between action buttons</span>
        {createPortal(<button data-testid="in-dialog">note field</button>, document.body)}
      </div>
    </a>
  );
}

describe("stopPortalClicks", () => {
  it("demonstrates the bug: without the guard a portal click reaches the Link", () => {
    const onLinkClick = vi.fn();
    render(<Card onLinkClick={onLinkClick} guarded={false} />);
    fireEvent.click(screen.getByTestId("in-dialog"));
    expect(onLinkClick).toHaveBeenCalledTimes(1);
  });

  it("stops clicks that came through a portal", () => {
    const onLinkClick = vi.fn();
    render(<Card onLinkClick={onLinkClick} guarded />);
    fireEvent.click(screen.getByTestId("in-dialog"));
    expect(onLinkClick).not.toHaveBeenCalled();
  });

  it("leaves clicks on the card's own DOM alone", () => {
    const onLinkClick = vi.fn();
    render(<Card onLinkClick={onLinkClick} guarded />);
    fireEvent.click(screen.getByTestId("inside"));
    expect(onLinkClick).toHaveBeenCalledTimes(1);
  });
});
