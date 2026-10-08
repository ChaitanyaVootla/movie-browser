/**
 * The home topic-pill row must support mouse drag-to-scroll like every other
 * horizontal row, and a drag must not open the pill it is released on.
 * (Before Oct 2026 it was a bare overflow row: desktop mouse users could not
 * drag it at all.)
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const trackAction = vi.fn();
vi.mock("@/hooks/use-analytics", () => ({ useAnalytics: () => ({ trackAction }) }));

import { TopicPills } from "./topic-pills";

afterEach(() => {
  cleanup();
  trackAction.mockClear();
});

const TOPICS = [
  { key: "action-movies", name: "Action Movies" },
  { key: "comedy-movies", name: "Comedy Movies" },
] as Parameters<typeof TopicPills>[0]["topics"];

const mouse = { pointerType: "mouse", button: 0, pointerId: 1 } as const;

describe("TopicPills drag-to-scroll", () => {
  it("scrolls on mouse drag and swallows the release click", () => {
    render(<TopicPills topics={TOPICS} />);
    const pill = screen.getByRole("link", { name: /Action/ });
    const row = pill.parentElement as HTMLElement;
    row.scrollLeft = 100;

    fireEvent.pointerDown(pill, { ...mouse, clientX: 300, clientY: 20 });
    fireEvent.pointerMove(pill, { ...mouse, buttons: 1, clientX: 240, clientY: 20 });
    fireEvent.pointerUp(pill, { ...mouse, clientX: 240, clientY: 20 });
    const notCancelled = fireEvent.click(pill, { detail: 1 });

    expect(row.scrollLeft).toBe(160);
    expect(notCancelled).toBe(false);
    expect(trackAction).not.toHaveBeenCalled();
  });

  it("a plain click still selects the topic", () => {
    render(<TopicPills topics={TOPICS} />);
    const pill = screen.getByRole("link", { name: /Action/ });
    fireEvent.pointerDown(pill, { ...mouse, clientX: 300, clientY: 20 });
    fireEvent.pointerUp(pill, { ...mouse, clientX: 300, clientY: 20 });
    fireEvent.click(pill, { detail: 1 });
    expect(trackAction).toHaveBeenCalledTimes(1);
  });
});
