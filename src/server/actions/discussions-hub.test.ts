import { describe, it, expect, vi } from "vitest";

// Mock server-only deps so the Zod schema can be imported in vitest
vi.mock("next-auth", () => ({ default: vi.fn(), auth: vi.fn() }));
vi.mock("@/lib/auth", () => ({ auth: vi.fn().mockResolvedValue(null) }));
vi.mock("@/server/db/postgres", () => ({ prisma: {} }));

import { HubTabSchema } from "./discussions-hub";

describe("HubTabSchema", () => {
  it("accepts hot/new/following", () => {
    expect(HubTabSchema.parse("hot")).toBe("hot");
    expect(HubTabSchema.parse("new")).toBe("new");
    expect(HubTabSchema.parse("following")).toBe("following");
  });
  it("rejects an unknown tab", () => {
    expect(() => HubTabSchema.parse("trending")).toThrow();
  });
});
