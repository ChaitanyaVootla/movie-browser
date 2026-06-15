import { describe, it, expect } from "vitest";
const HAS_DB = process.env.DATABASE_URL?.includes("5436") ?? false;
const d = HAS_DB ? describe : describe.skip;

d("searchMentionEntities", () => {
  it("returns sectioned results", async () => {
    const { searchMentionEntities } = await import("./catalog-search");
    const res = await searchMentionEntities({ query: "fight", anchor: { type: "movie", movieId: 550 } });
    expect(res).toHaveProperty("people");
    expect(res).toHaveProperty("titles");
    expect(res).toHaveProperty("cast");
    expect(res).toHaveProperty("episodes");
  });
});
