import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_PRISMA_OP_TIMEOUT_MS,
  PrismaOperationTimeoutError,
  resolveOperationTimeoutMs,
  withOperationDeadline,
} from "./operation-deadline";

describe("withOperationDeadline", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("rejects an operation that never settles once the deadline passes", async () => {
    const never = new Promise<number>(() => {});
    const onTimeout = vi.fn();
    const guarded = withOperationDeadline(never, 1000, "series.findUnique", onTimeout);
    const assertion = expect(guarded).rejects.toBeInstanceOf(PrismaOperationTimeoutError);

    await vi.advanceTimersByTimeAsync(999);
    expect(onTimeout).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);

    await assertion;
    expect(onTimeout).toHaveBeenCalledTimes(1);
    expect(onTimeout.mock.calls[0][0]).toMatchObject({
      label: "series.findUnique",
      timeoutMs: 1000,
    });
  });

  it("resolves with the operation's value and clears its timer", async () => {
    const guarded = withOperationDeadline(Promise.resolve(42), 1000, "movie.findMany");
    await expect(guarded).resolves.toBe(42);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("passes the operation's own rejection through unchanged", async () => {
    const boom = new Error("P2002");
    const guarded = withOperationDeadline(Promise.reject(boom), 1000, "user.create");
    await expect(guarded).rejects.toBe(boom);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("is a pass-through with no timer when disabled", async () => {
    const guarded = withOperationDeadline(Promise.resolve("x"), 0, "$raw.$queryRaw");
    expect(vi.getTimerCount()).toBe(0);
    await expect(guarded).resolves.toBe("x");
  });
});

describe("resolveOperationTimeoutMs", () => {
  it("defaults to the deadline inside the Next server when unset, blank or invalid", () => {
    for (const raw of [undefined, "", "soon", "-5"]) {
      expect(resolveOperationTimeoutMs(raw, true)).toBe(DEFAULT_PRISMA_OP_TIMEOUT_MS);
    }
  });

  it("defaults to no deadline outside the Next server (cron scripts run long queries)", () => {
    for (const raw of [undefined, "", "soon"]) {
      expect(resolveOperationTimeoutMs(raw, false)).toBe(0);
    }
  });

  it("lets an explicit value win in either context, including 0 to disable", () => {
    expect(resolveOperationTimeoutMs("45000", true)).toBe(45000);
    expect(resolveOperationTimeoutMs("0", true)).toBe(0);
    expect(resolveOperationTimeoutMs("1500", false)).toBe(1500);
  });
});
