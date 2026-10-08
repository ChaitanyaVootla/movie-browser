import { describe, it, expect, vi } from "vitest";

vi.mock("@/server/db/user-data", () => ({ getUserItemStatus: vi.fn() }));

import { getPageContextTool } from "./context";

async function run(pageContext: { path: string; query?: Record<string, string> }) {
  const out = await getPageContextTool.invoke({}, { configurable: { pageContext } });
  return JSON.parse(String(out)) as { page: string; query?: Record<string, string>; hint: string };
}

describe("get_page_context — library tab awareness", () => {
  it("names the library tab + filters from the whitelisted query", async () => {
    const res = await run({ path: "/library", query: { tab: "ratings", rating: "loved" } });
    expect(res.page).toBe("library");
    expect(res.query).toEqual({ tab: "ratings", rating: "loved" });
    expect(res.hint).toContain("Ratings tab (rating=loved)");
  });

  it("defaults to the Watching tab when no tab is present", async () => {
    const res = await run({ path: "/library" });
    expect(res.query).toBeUndefined();
    expect(res.hint).toContain("Watching (Up Next + Continue Watching) tab");
  });
});
