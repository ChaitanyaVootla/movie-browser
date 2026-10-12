/**
 * Per-invocation (= per user turn) action budgets for tools that WRITE on the
 * user's behalf, e.g. `record_rec_feedback` (max 5 per turn, taste v2 §5.3).
 *
 * Lives outside agent.ts so tools can import it without an import cycle
 * (agent.ts imports the tools). Part of the invocation's state: agent.ts
 * calls `clearInvocationBudget` when it cleans up its InvocationContext.
 */

const budgets = new Map<string, Map<string, number>>();

/** Safety net if a cleanup is ever skipped (crash mid-invocation). */
const MAX_TRACKED_INVOCATIONS = 5_000;

/**
 * Consume one unit of `key` for this invocation. true = allowed. Without a
 * real invocation id the cap cannot be enforced, so the action is refused.
 */
export function consumeInvocationBudget(invocationId: string | undefined, key: string, max: number): boolean {
  if (!invocationId || invocationId === "unknown") return false;
  let perKey = budgets.get(invocationId);
  if (!perKey) {
    if (budgets.size >= MAX_TRACKED_INVOCATIONS) {
      const oldest = budgets.keys().next();
      if (!oldest.done) budgets.delete(oldest.value);
    }
    perKey = new Map();
    budgets.set(invocationId, perKey);
  }
  const used = perKey.get(key) ?? 0;
  if (used >= max) return false;
  perKey.set(key, used + 1);
  return true;
}

export function clearInvocationBudget(invocationId: string): void {
  budgets.delete(invocationId);
}
