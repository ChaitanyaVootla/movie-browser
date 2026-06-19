import { describe, it, expect } from "vitest";
import { episodeDropPayloadKey, episodeDropMessage } from "./notify";

describe("episode-drop payload helpers", () => {
  it("builds a stable per (series,season) idempotency key", () => {
    expect(episodeDropPayloadKey(1396, 6)).toBe("series:1396:s6");
  });

  it("messages a season drop with the show title", () => {
    expect(episodeDropMessage("Stranger Things", 5)).toContain("Stranger Things");
    expect(episodeDropMessage("Stranger Things", 5)).toMatch(/season 5/i);
  });
});
