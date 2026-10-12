import { cleanup, fireEvent, render, renderHook, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const calls: string[] = [];
const trackAction = vi.fn((e: { action: string }) => calls.push(`track:${e.action}`));
vi.mock("@/hooks/use-analytics", () => ({ useAnalytics: () => ({ trackAction }) }));

import { CueEntryButton } from "./cue-entry";
import { useChatTrigger } from "./use-chat-trigger";
import { AI_CHAT_TRIGGER_EVENT, type AiChatTriggerDetail } from "./types";

const details: AiChatTriggerDetail[] = [];
const onTrigger = (e: Event) => {
  calls.push("event");
  details.push((e as CustomEvent<AiChatTriggerDetail>).detail);
};

afterEach(() => {
  cleanup();
  calls.length = 0;
  details.length = 0;
  trackAction.mockClear();
  window.removeEventListener(AI_CHAT_TRIGGER_EVENT, onTrigger);
});

describe("CueEntryButton", () => {
  it("fires cue_taste_entry, then the ai-chat-trigger event with the message", () => {
    window.addEventListener(AI_CHAT_TRIGGER_EVENT, onTrigger);
    render(<CueEntryButton message="Help me pick something" label="Ask Cue" entry="home_for_you" />);
    fireEvent.click(screen.getByRole("button", { name: /ask cue/i }));
    expect(calls).toEqual(["track:cue_taste_entry", "event"]);
    expect(trackAction).toHaveBeenCalledWith({ action: "cue_taste_entry", metadata: { entry: "home_for_you", prefill: false } });
    expect(details).toEqual([{ message: "Help me pick something" }]);
  });

  it("passes prefill through", () => {
    window.addEventListener(AI_CHAT_TRIGGER_EVENT, onTrigger);
    render(<CueEntryButton message="Tune my picks: " label="Steer with words" entry="tune_bar" variant="link" prefill />);
    fireEvent.click(screen.getByTestId("cue-entry-tune_bar"));
    expect(details).toEqual([{ message: "Tune my picks: ", prefill: true }]);
  });
});

describe("useChatTrigger (AssistantFloaty)", () => {
  const fire = (detail: unknown) => window.dispatchEvent(new CustomEvent(AI_CHAT_TRIGGER_EVENT, { detail }));

  it("sends without prefill", () => {
    const send = vi.fn();
    const prefill = vi.fn();
    renderHook(() => useChatTrigger({ send, prefill }));
    fire({ message: "Would I like this?" });
    expect(send).toHaveBeenCalledWith("Would I like this?");
    expect(prefill).not.toHaveBeenCalled();
  });

  it("prefill opens with the text and does NOT send", () => {
    const send = vi.fn();
    const prefill = vi.fn();
    renderHook(() => useChatTrigger({ send, prefill }));
    fire({ message: "Tune my picks: ", prefill: true });
    expect(prefill).toHaveBeenCalledWith("Tune my picks: ");
    expect(send).not.toHaveBeenCalled();
  });

  it("ignores malformed or empty details", () => {
    const send = vi.fn();
    const prefill = vi.fn();
    renderHook(() => useChatTrigger({ send, prefill }));
    fire(null);
    fire({ message: 3 });
    fire({ message: "   " });
    expect(send).not.toHaveBeenCalled();
    expect(prefill).not.toHaveBeenCalled();
  });
});
