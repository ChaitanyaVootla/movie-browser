import { describe, it, expect } from "vitest";
import { decideStatus, parseGateOutput } from "./gate-policy";

describe("decideStatus", () => {
  it("publishes clean content", () => {
    expect(decideStatus(0)).toBe("PUBLISHED");
    expect(decideStatus(0.49)).toBe("PUBLISHED");
  });

  it("queues borderline content for review", () => {
    expect(decideStatus(0.5)).toBe("PENDING_REVIEW");
    expect(decideStatus(0.84)).toBe("PENDING_REVIEW");
  });

  it("flags toxic content", () => {
    expect(decideStatus(0.85)).toBe("FLAGGED");
    expect(decideStatus(1)).toBe("FLAGGED");
  });

  it("FAIL-OPEN: missing/invalid toxicity NEVER silently publishes", () => {
    expect(decideStatus(null)).toBe("PENDING_REVIEW");
    expect(decideStatus(undefined)).toBe("PENDING_REVIEW");
    expect(decideStatus(Number.NaN)).toBe("PENDING_REVIEW");
  });
});

describe("parseGateOutput", () => {
  it("parses minified JSON", () => {
    const out = parseGateOutput('{"toxicity":0.1,"labels":[],"spoiler":{"scope":"NONE"}}');
    expect(out?.toxicity).toBe(0.1);
    expect(out?.spoiler?.scope).toBe("NONE");
  });

  it("extracts JSON wrapped in model chatter", () => {
    const out = parseGateOutput('Sure! {"toxicity":0.2,"labels":["mild-language"]} Hope that helps.');
    expect(out?.toxicity).toBe(0.2);
    expect(out?.labels).toEqual(["mild-language"]);
  });

  it("returns null on garbage / schema violations", () => {
    expect(parseGateOutput("not json")).toBeNull();
    expect(parseGateOutput('{"toxicity":"high"}')).toBeNull();
    expect(parseGateOutput('{"toxicity":7}')).toBeNull();
  });
});
