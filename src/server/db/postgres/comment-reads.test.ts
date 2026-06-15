import { describe, it, expect } from "vitest";
import { newSinceFromRows } from "./comment-reads";

describe("newSinceFromRows", () => {
  const rows = [
    { createdAt: "2026-06-15T12:00:00.000Z" },
    { createdAt: "2026-06-14T12:00:00.000Z" },
    { createdAt: "2026-06-13T12:00:00.000Z" },
  ];
  it("counts rows strictly newer than the cursor", () => {
    expect(newSinceFromRows(rows, "2026-06-14T00:00:00.000Z")).toBe(2);
  });
  it("counts everything when there is no cursor (first visit)", () => {
    expect(newSinceFromRows(rows, null)).toBe(3);
  });
  it("counts nothing when the cursor is current", () => {
    expect(newSinceFromRows(rows, "2026-06-15T12:00:00.000Z")).toBe(0);
  });
});
