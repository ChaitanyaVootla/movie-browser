import { describe, expect, it } from "vitest";
import { getSystemPrompt } from "./system";

const TASTE_TOOLS = ["get_taste_detail", "explain_title_fit", "compare_taste", "steer_recs", "record_rec_feedback"];

describe("system prompt — taste tools (taste v2 §5.3)", () => {
  const authed = getSystemPrompt(true, null);
  const guest = getSystemPrompt(false, null);

  it("lists 18 tools, including the five taste tools, in the quick reference", () => {
    expect(authed).toContain("Tools Quick Reference (18 tools)");
    const table = authed.slice(authed.indexOf("Tools Quick Reference"), authed.indexOf("## `navigate_to`"));
    for (const n of TASTE_TOOLS) expect(table).toContain(`| \`${n}\` |`);
    expect(table.match(/^\| `[a-z_]+` \|/gm)).toHaveLength(18);
  });

  it("guests are not shown the taste tools in the quick reference", () => {
    expect(guest).toContain("Tools Quick Reference (13 tools)");
    const table = guest.slice(guest.indexOf("Tools Quick Reference"), guest.indexOf("## `navigate_to`"));
    for (const n of TASTE_TOOLS) expect(table).not.toContain(`| \`${n}\` |`);
    expect(table.match(/^\| `[a-z_]+` \|/gm)).toHaveLength(13);
  });

  it("guest prompt lists all five taste tools as never-call, in the final guest section too", () => {
    const neverCall = guest.split("\n").filter((l) => /NEVER call|don't call them/i.test(l));
    for (const n of TASTE_TOOLS) {
      expect(neverCall.some((l) => l.includes(n))).toBe(true);
    }
    const guestTail = guest.slice(guest.indexOf("## Guest User"));
    for (const n of TASTE_TOOLS) expect(guestTail).toContain(n);
  });

  it("guest prompt never teaches the [TUNE] tag or routes to taste tools", () => {
    expect(guest).not.toContain("[TUNE:");
    expect(guest).not.toMatch(/→ `?steer_recs/);
    expect(guest).not.toMatch(/→ `?explain_title_fit/);
  });

  it("signed-in prompt routes the three intents and teaches the [TUNE] contract", () => {
    expect(authed).toMatch(/shorter[\s\S]*darker[\s\S]*steer_recs/i);
    expect(authed).toMatch(/would I like[\s\S]*explain_title_fit/i);
    expect(authed).toMatch(/and I[\s\S]*compare_taste/i);
    expect(authed).toContain("[TUNE:");
    expect(authed).toMatch(/exactly ONE \[TUNE/i);
    expect(authed).toMatch(/never label the person/i);
  });

  it("keeps the taste examples free of real titles (Kimi parrots examples)", () => {
    const section = authed.slice(authed.indexOf("## Taste tools"), authed.indexOf("## Taste tools") + 4000);
    expect(section).toContain("<Title>");
  });
});
