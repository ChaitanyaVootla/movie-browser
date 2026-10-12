import { describe, expect, it } from "vitest";
import { clearInvocationBudget, consumeInvocationBudget } from "./invocation-budget";

describe("invocation budget", () => {
  it("allows up to max per invocation and key, then refuses", () => {
    const results = Array.from({ length: 7 }, () => consumeInvocationBudget("inv-1", "rec_feedback", 5));
    expect(results).toEqual([true, true, true, true, true, false, false]);
  });

  it("is isolated per invocation and per key", () => {
    for (let i = 0; i < 5; i++) consumeInvocationBudget("inv-2", "a", 5);
    expect(consumeInvocationBudget("inv-2", "a", 5)).toBe(false);
    expect(consumeInvocationBudget("inv-2", "b", 5)).toBe(true);
    expect(consumeInvocationBudget("inv-3", "a", 5)).toBe(true);
  });

  it("resets after clear", () => {
    for (let i = 0; i < 5; i++) consumeInvocationBudget("inv-4", "a", 5);
    clearInvocationBudget("inv-4");
    expect(consumeInvocationBudget("inv-4", "a", 5)).toBe(true);
  });

  it("refuses without an invocation id (the cap cannot be enforced)", () => {
    expect(consumeInvocationBudget(undefined, "a", 5)).toBe(false);
    expect(consumeInvocationBudget("unknown", "a", 5)).toBe(false);
  });
});
