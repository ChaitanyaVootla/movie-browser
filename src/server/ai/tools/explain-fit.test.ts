import { beforeEach, describe, expect, it, vi } from "vitest";

const explainTitleFitForUser = vi.fn();
vi.mock("@/server/services/taste/explain-fit", () => ({
  explainTitleFitForUser: (...args: unknown[]) => explainTitleFitForUser(...args),
}));
vi.mock("@/lib/logger", () => ({ aiToolLogger: { error: vi.fn() } }));

const { explainTitleFitHandler, ExplainTitleFitSchema } = await import("./explain-fit");

const cfg = (userId?: string) => ({ configurable: { userId } });
const parse = async (p: Promise<string>) => JSON.parse(await p);

beforeEach(() => {
  explainTitleFitForUser.mockReset();
});

describe("explain_title_fit", () => {
  it("errors for guests without touching the service", async () => {
    const out = await parse(explainTitleFitHandler(ExplainTitleFitSchema.parse({ mediaType: "movie", id: 1 }), cfg()));
    expect(out.error).toBe("Not logged in");
    expect(explainTitleFitForUser).not.toHaveBeenCalled();
  });

  it("returns the fit for the signed-in user", async () => {
    explainTitleFitForUser.mockResolvedValue({
      ok: true,
      fit: { tasteCos: 0.41, verdictBucket: "close", anchors: [{ title: "Anchor", cos: 0.7 }] },
    });
    const out = await parse(explainTitleFitHandler({ mediaType: "series", id: 1399 }, cfg("7")));
    expect(explainTitleFitForUser).toHaveBeenCalledWith(7, { mediaType: "series", id: 1399 });
    expect(out.verdictBucket).toBe("close");
    expect(out.anchors[0].title).toBe("Anchor");
    expect(out.note).toMatch(/never/i);
  });

  it("maps no_profile / not_found to an error with a hint", async () => {
    explainTitleFitForUser.mockResolvedValueOnce({ ok: false, error: "no_profile" });
    const cold = await parse(explainTitleFitHandler({ mediaType: "movie", id: 1 }, cfg("7")));
    expect(cold.error).toBe("no_profile");
    expect(cold.hint).toBeDefined();

    explainTitleFitForUser.mockResolvedValueOnce({ ok: false, error: "not_found" });
    const missing = await parse(explainTitleFitHandler({ mediaType: "movie", id: 1 }, cfg("7")));
    expect(missing.error).toBe("not_found");
  });

  it("returns { error } when the service throws", async () => {
    explainTitleFitForUser.mockImplementation(async () => { throw new Error("db down"); });
    const out = await parse(explainTitleFitHandler({ mediaType: "movie", id: 1 }, cfg("7")));
    expect(out.error).toBeDefined();
  });

  it("validates input", () => {
    expect(() => ExplainTitleFitSchema.parse({ mediaType: "person", id: 1 })).toThrow();
    expect(() => ExplainTitleFitSchema.parse({ mediaType: "movie", id: -1 })).toThrow();
  });
});
