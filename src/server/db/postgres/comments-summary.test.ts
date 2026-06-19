import { describe, it, expect } from "vitest";
import { summaryToBaseline } from "./comments";

describe("summaryToBaseline", () => {
  it("maps a summary to the adaptive baseline DTO", () => {
    const r = summaryToBaseline({ publishedCount: 248, lastActivityAt: "2026-06-15T10:00:00.000Z" });
    expect(r.publishedCount).toBe(248);
    expect(r.variant).toBe("count");
    expect(r.label).toBe("248 comments");
  });
  it("invites when below threshold", () => {
    const r = summaryToBaseline({ publishedCount: 2, lastActivityAt: null });
    expect(r.variant).toBe("invite");
    expect(r.label).toBe("Join the discussion");
  });
});
