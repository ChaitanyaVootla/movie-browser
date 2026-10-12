import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const seen: Array<{ content: string; live: boolean }> = [];
vi.mock("next/dynamic", () => ({
  default: () =>
    function LazyStub(props: { content: string; live: boolean }) {
      seen.push(props);
      return null;
    },
}));

import { TuneTagSlot } from "./tune-tag-slot";
import { stripTuneTag } from "./tune-tag-text";

afterEach(() => {
  cleanup();
  seen.length = 0;
});

describe("TuneTagSlot", () => {
  it("loads the pill only for replies carrying a tag", () => {
    render(<TuneTagSlot content="Plain reply" isStreaming />);
    expect(seen).toEqual([]);
  });

  it("marks a reply live once it streamed while mounted, and keeps it live after", () => {
    const { rerender } = render(<TuneTagSlot content="Here [TUNE:ser" isStreaming />);
    rerender(<TuneTagSlot content="Here [TUNE:series]" isStreaming={false} />);
    expect(seen.at(-1)).toEqual({ content: "Here [TUNE:series]", live: true });
  });

  it("restored history is never live", () => {
    render(<TuneTagSlot content="Old [TUNE:series]" />);
    expect(seen.at(-1)?.live).toBe(false);
  });

  it("strips the tag from display text (also mid-stream)", () => {
    expect(stripTuneTag("Here you go. [TUNE:series,darker]")).toBe("Here you go. ");
    expect(stripTuneTag("Here you go. [TUNE:ser")).toBe("Here you go. ");
  });
});
