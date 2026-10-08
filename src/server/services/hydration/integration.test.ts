import { describe, it, expect, vi } from "vitest";

vi.mock("./index", () => ({}));
vi.mock("@/server/utils", () => ({ getCountryCode: vi.fn(), SSR_RENDER_COUNTRY: "IN" }));

import { groupScrapedLinksByCountry } from "./integration";

describe("groupScrapedLinksByCountry", () => {
  it("keeps each deep link in its own country (was: everything in IN → 5x duplicates on the detail page)", () => {
    const map = groupScrapedLinksByCountry([
      { provider: "Apple TV Store", link: "https://tv.apple.com/in/x", price: "Rent ₹399", country: "IN" },
      { provider: "Apple TV Store", link: "https://tv.apple.com/us/x", price: "Rent $24.99", country: "US" },
      { provider: "Cineplex Entertainment", link: "https://cineplex.com/x", price: "In cinemas", country: "CA" },
      { provider: "Netflix", link: "https://netflix.com/title/1", price: "Subscription" },
    ]);
    expect(Object.keys(map ?? {}).sort()).toEqual(["CA", "IN", "US"]);
    expect(map?.IN?.map((l) => l.link)).toEqual(["https://tv.apple.com/in/x", "https://netflix.com/title/1"]);
    expect(map?.US).toHaveLength(1);
  });
  it("returns undefined for no links", () => {
    expect(groupScrapedLinksByCountry([])).toBeUndefined();
  });
});
