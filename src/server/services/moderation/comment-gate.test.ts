import { describe, it, expect } from "vitest";
import { parseGateResponse } from "./comment-gate";

describe("parseGateResponse", () => {
  it("parses a clean JSON response", () => {
    const out = parseGateResponse(
      '{"toxicity":"ok","toxicity_reason":null,"spoiler_scope":"EPISODE","scope_season":2,"scope_episode":5}'
    );
    expect(out).toEqual({
      toxicity: "ok",
      toxicityReason: null,
      suggestedScope: "EPISODE",
      suggestedSeason: 2,
      suggestedEpisode: 5,
    });
  });
  it("strips markdown code fences", () => {
    const out = parseGateResponse('```json\n{"toxicity":"flagged","toxicity_reason":"harassment","spoiler_scope":"NONE","scope_season":null,"scope_episode":null}\n```');
    expect(out?.toxicity).toBe("flagged");
    expect(out?.toxicityReason).toBe("harassment");
  });
  it("returns null on garbage / wrong shape", () => {
    expect(parseGateResponse("I think this comment is fine")).toBeNull();
    expect(parseGateResponse('{"toxicity":"maybe"}')).toBeNull();
    expect(parseGateResponse("")).toBeNull();
  });
  it("tolerates missing optional fields", () => {
    const out = parseGateResponse('{"toxicity":"ok","spoiler_scope":"NONE"}');
    expect(out).toEqual({
      toxicity: "ok",
      toxicityReason: null,
      suggestedScope: "NONE",
      suggestedSeason: null,
      suggestedEpisode: null,
    });
  });
});
