import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { RecItemDTO, RecRowDTO } from "@/lib/taste/recommend-types";

vi.mock("@/hooks/use-mobile", () => ({ useMobile: () => false }));
vi.mock("@/hooks/use-history-dismiss", () => ({ useHistoryDismiss: () => undefined }));
vi.mock("@/hooks/use-analytics", () => ({ useAnalytics: () => ({ trackAction: vi.fn() }) }));
vi.mock("next/image", () => ({ default: () => null }));

import RecWhySheet from "./rec-why-sheet";

const item = {
  mediaType: "movie",
  id: 13,
  title: "Forrest Gump",
  posterPath: null,
  source: "taste",
  explanation: { kind: "facet", label: "Comedy", facets: [] },
} as unknown as RecItemDTO;
const row = { id: "for-you", kind: "for_you", anchors: [], label: null, items: [item], tune: null } as RecRowDTO;

describe("RecWhySheet", () => {
  it("'Why would I like this?' opens Cue AND closes the sheet (no stacked drawers)", () => {
    const onClose = vi.fn();
    const sent: string[] = [];
    const on = (e: Event) => sent.push((e as CustomEvent<{ message: string }>).detail.message);
    window.addEventListener("ai-chat-trigger", on);
    render(
      <RecWhySheet
        target={{ kind: "item", item, row }}
        anchorEl={null}
        onClose={onClose}
        onMoreLikeThis={vi.fn()}
        onDismiss={vi.fn()}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "Why would I like this?" }));
    window.removeEventListener("ai-chat-trigger", on);
    expect(sent).toHaveLength(1);
    expect(sent[0]).toContain("Forrest Gump");
    expect(onClose).toHaveBeenCalled();
  });
});
