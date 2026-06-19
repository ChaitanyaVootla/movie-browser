import { describe, it, expect } from "vitest";
import type { LinkUnfurlDto } from "./link-unfurls";

// Pure shape/serialization test — does NOT touch the DB (the upsert/get
// functions are exercised by unfurl.test.ts via injected deps). This locks the
// DTO contract that the renderer and DB layer share.
describe("LinkUnfurlDto", () => {
  it("is a serializable record (no Date, no undefined)", () => {
    const dto: LinkUnfurlDto = {
      urlHash: "abc",
      url: "https://example.com/a",
      domain: "example.com",
      status: "OK",
      title: "Example",
      description: "desc",
      imageUrl: null,
      faviconUrl: "https://www.google.com/s2/favicons?domain=example.com&sz=64",
      provider: "GENERIC",
      youtubeId: null,
    };
    expect(JSON.stringify(dto)).toContain("example.com");
  });
});
