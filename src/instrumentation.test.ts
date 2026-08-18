/**
 * Regression tests for the server instrumentation entry point.
 *
 * WHY: `startCacheJanitor()` sat in `src/instrumentation.node.ts` for ~2.5
 * months. Next has NO `instrumentation.node.ts` convention, so it was never
 * loaded, the L2 janitor never ran, and `.cache/` grew to 44GB against a ~2.8GB
 * budget — nearly filling the 116GB root volume (the same failure that took prod
 * down on Jun 10 and Jun 19). Nothing caught it: it is invisible to typecheck,
 * lint, and every other test. These tests pin the wiring.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const startCacheJanitor = vi.fn();

vi.mock("@/lib/cache-service", () => ({
  startCacheJanitor: () => startCacheJanitor(),
}));

async function runRegister(env: { runtime?: string; nodeEnv?: string }): Promise<void> {
  // vi.stubEnv (not direct assignment) — NODE_ENV is typed readonly.
  vi.stubEnv("NEXT_RUNTIME", env.runtime ?? "");
  vi.stubEnv("NODE_ENV", env.nodeEnv ?? "test");
  vi.resetModules();
  const mod = await import("./instrumentation");
  await mod.register();
}

describe("instrumentation register()", () => {
  beforeEach(() => {
    startCacheJanitor.mockClear();
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("starts the L2 cache janitor in the nodejs runtime IN PRODUCTION", async () => {
    // The whole point: the janitor must NOT sit behind a dev-only guard. This is
    // the exact assertion whose absence let the 44GB cache happen.
    await runRegister({ runtime: "nodejs", nodeEnv: "production" });
    expect(startCacheJanitor).toHaveBeenCalledTimes(1);
  });

  it("starts the janitor in development too", async () => {
    await runRegister({ runtime: "nodejs", nodeEnv: "development" });
    expect(startCacheJanitor).toHaveBeenCalledTimes(1);
  });

  it("does NOT start the janitor on the edge runtime (no fs there)", async () => {
    await runRegister({ runtime: "edge", nodeEnv: "production" });
    expect(startCacheJanitor).not.toHaveBeenCalled();
  });

  it("never throws if the janitor import/start fails (startup must survive)", async () => {
    startCacheJanitor.mockImplementationOnce(() => {
      throw new Error("boom");
    });
    await expect(runRegister({ runtime: "nodejs", nodeEnv: "production" })).resolves.toBeUndefined();
  });
});

describe("instrumentation.node.ts must not come back", () => {
  it("has no second server instrumentation file", async () => {
    // Next auto-loads ONLY `instrumentation.ts`. A sibling `instrumentation.node.ts`
    // looks authoritative, is never executed, and silently swallows startup work.
    const { existsSync } = await import("node:fs");
    const { join } = await import("node:path");
    expect(existsSync(join(process.cwd(), "src", "instrumentation.node.ts"))).toBe(false);
  });
});
