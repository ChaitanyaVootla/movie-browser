import { describe, expect, it } from "vitest";
import { SIGNED_IN_ONLY_TOOLS, toolsForAudience } from "./audience";

const tools = ["search", "recommend_for_me", ...SIGNED_IN_ONLY_TOOLS].map((name) => ({ name }));

describe("toolsForAudience", () => {
  it("binds every tool for a signed-in user", () => {
    expect(toolsForAudience(tools, true)).toHaveLength(tools.length);
  });

  it("never offers the five taste tools to a guest", () => {
    const names = toolsForAudience(tools, false).map((t) => t.name);
    expect(names).toEqual(["search", "recommend_for_me"]);
    expect(SIGNED_IN_ONLY_TOOLS.size).toBe(5);
  });
});
