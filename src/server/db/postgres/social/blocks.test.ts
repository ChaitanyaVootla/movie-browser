import { describe, it, expect } from "vitest";
import { computeHiddenUserIds, type BlockRowInput } from "./blocks";

const row = (blockerId: number, blockedId: number, type: "BLOCK" | "MUTE"): BlockRowInput => ({
  blockerId,
  blockedId,
  type,
});

describe("computeHiddenUserIds", () => {
  it("viewer's own BLOCK and MUTE hide the target", () => {
    const hidden = computeHiddenUserIds(1, [row(1, 2, "BLOCK"), row(1, 3, "MUTE")]);
    expect(hidden.has(2)).toBe(true);
    expect(hidden.has(3)).toBe(true);
  });

  it("being BLOCKed hides the blocker (mutual invisibility)", () => {
    const hidden = computeHiddenUserIds(1, [row(9, 1, "BLOCK")]);
    expect(hidden.has(9)).toBe(true);
  });

  it("being MUTEd does NOT hide the muter (one-way)", () => {
    const hidden = computeHiddenUserIds(1, [row(9, 1, "MUTE")]);
    expect(hidden.has(9)).toBe(false);
  });

  it("unrelated rows are ignored", () => {
    const hidden = computeHiddenUserIds(1, [row(5, 6, "BLOCK")]);
    expect(hidden.size).toBe(0);
  });
});
