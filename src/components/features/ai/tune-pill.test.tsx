import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const trackAction = vi.fn();
vi.mock("@/hooks/use-analytics", () => ({ useAnalytics: () => ({ trackAction }) }));
let pathname = "/";
vi.mock("next/navigation", () => ({ usePathname: () => pathname }));

import { TunePill } from "./tune-pill";
import { RECS_TUNE_EVENT } from "./types";

const events: string[][] = [];
const onTune = (e: Event) => events.push((e as CustomEvent<{ tokens: string[] }>).detail.tokens);

beforeEach(() => {
  pathname = "/";
  events.length = 0;
  window.addEventListener(RECS_TUNE_EVENT, onTune);
});
afterEach(() => {
  cleanup();
  trackAction.mockClear();
  window.removeEventListener(RECS_TUNE_EVENT, onTune);
});

describe("TunePill", () => {
  it("applies a freshly streamed tag once on home, with validated tokens", () => {
    const final = "Darker series it is. [TUNE:series,spooky,darker]";
    const { rerender } = render(<TunePill content="Darker series it is. [TUNE:ser" live />);
    expect(screen.queryByTestId("ai-tune-pill")).toBeNull();
    rerender(<TunePill content={final} live />);
    rerender(<TunePill content={final} live />);
    expect(events).toEqual([["series", "darker"]]);
    expect(trackAction).toHaveBeenCalledWith({ action: "cue_tune_applied", metadata: { tokens: ["series", "darker"], via: "auto" } });
    expect(screen.getByTestId("ai-tune-pill").textContent).toContain("Applied to your For-you row");

    // A second view rendering the same reply does not re-apply it.
    render(<TunePill content={final} live />);
    expect(events).toHaveLength(1);
  });

  it("text streaming on AFTER the tag dispatches once (keyed on message + tag, not content)", () => {
    const head = "Here you go. [TUNE:series,lighter]";
    const { rerender } = render(<TunePill content={head} messageId="m-42" live />);
    rerender(<TunePill content={`${head} Also`} messageId="m-42" live />);
    rerender(<TunePill content={`${head} Also try the`} messageId="m-42" live />);
    rerender(<TunePill content={`${head} Also try the first one.`} messageId="m-42" live />);
    expect(events).toEqual([["series", "lighter"]]);
    expect(trackAction).toHaveBeenCalledTimes(1);
    // without an id, the text up to the tag is the key — still once
    cleanup();
    const head2 = "Sure. [TUNE:movies,under100]";
    const r2 = render(<TunePill content={head2} live />);
    r2.rerender(<TunePill content={`${head2} Enjoy`} live />);
    r2.rerender(<TunePill content={`${head2} Enjoy it.`} live />);
    expect(events).toEqual([["series", "lighter"], ["movies", "under100"]]);
  });

  it("never auto-applies restored history, but a tap applies it", () => {
    render(<TunePill content="Old reply [TUNE:movies,classic]" />);
    expect(events).toEqual([]);
    fireEvent.click(screen.getByTestId("ai-tune-pill"));
    expect(events).toEqual([["movies", "classic"]]);
  });

  it("links to /?tune=… off the home page and dispatches nothing", () => {
    pathname = "/movie/1/x";
    render(<TunePill content="New reply [TUNE:under100,lighter]" live />);
    const pill = screen.getByTestId("ai-tune-pill");
    expect(pill.getAttribute("href")).toBe("/?tune=under100%2Clighter");
    expect(events).toEqual([]);
  });

  it("renders nothing without a valid tag", () => {
    render(<TunePill content="No tag. [TUNE:weird]" live />);
    expect(screen.queryByTestId("ai-tune-pill")).toBeNull();
    expect(events).toEqual([]);
  });
});
