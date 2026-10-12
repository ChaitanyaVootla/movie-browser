import { beforeEach, describe, expect, it, vi } from "vitest";

const recordRecFeedbackFor = vi.fn();
const undoRecFeedbackFor = vi.fn();
vi.mock("@/server/services/taste/rec-feedback", () => ({
  recordRecFeedbackFor: (...a: unknown[]) => recordRecFeedbackFor(...a),
  undoRecFeedbackFor: (...a: unknown[]) => undoRecFeedbackFor(...a),
}));
vi.mock("@/lib/logger", () => ({ aiToolLogger: { error: vi.fn() } }));

const { recordRecFeedbackHandler, RecordRecFeedbackSchema, REC_FEEDBACK_PER_TURN } = await import("./rec-feedback");
const { clearInvocationBudget } = await import("../invocation-budget");

const cfg = (userId?: string, invocationId = "inv-a") => ({ configurable: { userId, invocationId } });
const parse = async (p: Promise<string>) => JSON.parse(await p);
const dismiss = { mediaType: "movie" as const, id: 42, kind: "dismiss" as const };

beforeEach(() => {
  recordRecFeedbackFor.mockReset();
  undoRecFeedbackFor.mockReset();
  recordRecFeedbackFor.mockResolvedValue({ ok: true });
  undoRecFeedbackFor.mockResolvedValue({ ok: true });
  clearInvocationBudget("inv-a");
  clearInvocationBudget("inv-b");
});

describe("record_rec_feedback", () => {
  it("errors for guests without touching the service", async () => {
    const out = await parse(recordRecFeedbackHandler(dismiss, cfg(undefined)));
    expect(out.error).toBe("Not logged in");
    expect(recordRecFeedbackFor).not.toHaveBeenCalled();
  });

  it("writes a DISMISS through the shared service with source cue", async () => {
    const out = await parse(recordRecFeedbackHandler(dismiss, cfg("4")));
    expect(out).toEqual({ ok: true, kind: "dismiss", mediaType: "movie", id: 42 });
    expect(recordRecFeedbackFor).toHaveBeenCalledWith(4, { mediaType: "movie", id: 42, kind: "DISMISS" }, "cue");
  });

  it("undoes a dismissal", async () => {
    const out = await parse(recordRecFeedbackHandler({ ...dismiss, kind: "undo_dismiss" }, cfg("4")));
    expect(out.ok).toBe(true);
    expect(undoRecFeedbackFor).toHaveBeenCalledWith(4, { mediaType: "movie", id: 42, kind: "DISMISS" });
    expect(recordRecFeedbackFor).not.toHaveBeenCalled();
  });

  it(`caps writes at ${5} per turn (invocation), per invocation`, async () => {
    expect(REC_FEEDBACK_PER_TURN).toBe(5);
    const outs = [];
    for (let i = 0; i < 7; i++) outs.push(await parse(recordRecFeedbackHandler({ ...dismiss, id: i + 1 }, cfg("4"))));
    expect(outs.filter((o) => o.ok)).toHaveLength(5);
    expect(outs[5].error).toBe("limit_reached");
    expect(recordRecFeedbackFor).toHaveBeenCalledTimes(5);
    // A new turn has a fresh budget.
    expect((await parse(recordRecFeedbackHandler(dismiss, cfg("4", "inv-b")))).ok).toBe(true);
  });

  it("refuses when the turn cannot be identified", async () => {
    const out = await parse(recordRecFeedbackHandler(dismiss, { configurable: { userId: "4" } }));
    expect(out.error).toBeDefined();
    expect(recordRecFeedbackFor).not.toHaveBeenCalled();
  });

  it("returns { error } on a failed or throwing write", async () => {
    recordRecFeedbackFor.mockResolvedValueOnce({ ok: false, error: "not_found" });
    expect((await parse(recordRecFeedbackHandler(dismiss, cfg("4")))).error).toBe("not_found");
    recordRecFeedbackFor.mockRejectedValueOnce(new Error("not implemented"));
    expect((await parse(recordRecFeedbackHandler(dismiss, cfg("4")))).error).toBeDefined();
  });

  it("validates input", () => {
    expect(() => RecordRecFeedbackSchema.parse({ ...dismiss, kind: "skip" })).toThrow();
    expect(() => RecordRecFeedbackSchema.parse({ ...dismiss, id: 0 })).toThrow();
  });
});
