import { describe, it, expect, vi } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { DiscussionEntryStripClient } from "./discussion-entry-strip-client";

// The server action pulls in server-only deps; stub it so the client island
// renders in isolation (we are asserting markup, not the viewer upgrade).
vi.mock("@/server/actions/discussion-reads", () => ({
  getAnchorActivity: vi.fn().mockResolvedValue({
    publishedCount: 0,
    newSinceLastSeen: 0,
    signedIn: false,
  }),
}));

describe("DiscussionEntryStripClient markup", () => {
  const props = {
    anchor: { type: "movie", movieId: 603 } as const,
    baselineLabel: "Start the discussion",
    anchorJumpHref: "#discussion",
    dedicatedHref: "/movie/603/the-matrix/discussions",
  };

  it("does NOT nest an anchor inside another anchor", () => {
    const { container } = render(<DiscussionEntryStripClient {...props} />);
    const anchors = container.querySelectorAll("a");
    // Exactly one anchor (the dedicated "View all" link); the jump affordance is a button.
    expect(anchors.length).toBe(1);
    anchors.forEach((a) => {
      expect(a.querySelector("a")).toBeNull();
      expect(a.closest("a:not(:scope)")).toBeNull();
    });
    cleanup();
  });

  it("exposes both targets: a jump button (#discussion) and a dedicated-page link", () => {
    const { container, getByRole } = render(<DiscussionEntryStripClient {...props} />);
    // Jump affordance is a button, not an anchor.
    const jump = getByRole("button");
    expect(jump.getAttribute("type")).toBe("button");
    expect(jump.hasAttribute("data-discussion-strip")).toBe(true);
    // Dedicated page is reachable via a real anchor href.
    const link = container.querySelector('a[href="/movie/603/the-matrix/discussions"]');
    expect(link).not.toBeNull();
    cleanup();
  });
});
