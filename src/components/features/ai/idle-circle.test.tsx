/**
 * The idle Cue bubble is a native <button>. Pressing Enter on it must open the
 * chat ONCE. It used to also handle Enter/Space in onKeyDown, on top of the
 * click the browser synthesises for a button, so a single keypress opened the
 * chat twice and tracked ai_chat_open twice.
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const trackAIChatOpen = vi.fn();
vi.mock("@/hooks/use-analytics", () => ({ useAnalytics: () => ({ trackAIChatOpen }) }));

import { IdleCircle } from "./idle-circle";

afterEach(() => {
  cleanup();
  trackAIChatOpen.mockClear();
});

describe("IdleCircle keyboard activation", () => {
  it("Enter opens the chat exactly once", () => {
    const onExpand = vi.fn();
    render(
      <IdleCircle
        onExpand={onExpand}
        showPrompt={false}
        prompt={null}
        hasActiveConversation={false}
      />
    );
    const trigger = screen.getByTestId("ai-assistant-trigger");

    // What a browser does for Enter on a focused <button>: keydown, then the
    // synthesised click (happy-dom does not synthesise it, so fire it here).
    fireEvent.keyDown(trigger, { key: "Enter" });
    fireEvent.click(trigger, { detail: 0 });

    expect(onExpand).toHaveBeenCalledTimes(1);
    expect(trackAIChatOpen).toHaveBeenCalledTimes(1);
  });
});
