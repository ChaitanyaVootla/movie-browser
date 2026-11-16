import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
// CJS script — exercised here for its pure prune logic (the top-level run is
// guarded by `require.main === module`, so importing does not execute it).
import { pruneTarget, collectEntries, removeEmptyDirs, isrPrunePlan, run } from "./prune-isr-cache";

let tmp: string;

function write(rel: string, bytes: number, ageHours: number) {
  const full = path.join(tmp, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, Buffer.alloc(bytes, 1));
  const mtime = new Date(Date.now() - ageHours * 3600 * 1000);
  fs.utimesSync(full, mtime, mtime);
  return full;
}

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "prune-test-"));
});
afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
});

const NOW = Date.now();
const MB = 1024 * 1024;

describe("pruneTarget — image cache (no extension filter)", () => {
  it("deletes oldest-first until under budget, keeps newest", () => {
    write("images/a/old.webp", 2 * MB, 1); // oldest
    write("images/b/mid.avif", 2 * MB, 0.5);
    const keep = write("images/c/new.jpeg", 2 * MB, 0.1); // newest

    const r = pruneTarget("images", [path.join(tmp, "images")], 3 * MB, null, NOW);

    expect(r.deleted).toBe(2); // 6MB → must drop below 3MB
    expect(fs.existsSync(keep)).toBe(true);
    expect(fs.existsSync(path.join(tmp, "images/a/old.webp"))).toBe(false);
  });

  it("no-ops when under budget", () => {
    write("images/a/x.webp", 1 * MB, 1);
    const r = pruneTarget("images", [path.join(tmp, "images")], 10 * MB, null, NOW);
    expect(r.deleted).toBe(0);
    expect(r.freed).toBe(0);
  });

  it("age pass removes entries older than the 72h cutoff even if a later pass isn't needed", () => {
    write("images/a/stale.webp", 1 * MB, 100); // > 72h
    write("images/b/fresh.webp", 5 * MB, 1);
    // total 6MB > 5MB budget → age pass runs and drops the stale one first
    const r = pruneTarget("images", [path.join(tmp, "images")], 5 * MB, null, NOW);
    expect(fs.existsSync(path.join(tmp, "images/a/stale.webp"))).toBe(false);
    expect(r.deleted).toBeGreaterThanOrEqual(1);
  });
});

describe("pruneTarget — ISR route cache (extension filter)", () => {
  it("only counts .html/.rsc/.meta, ignores other files", () => {
    write("app/movie/1.html", 4 * MB, 1);
    write("app/movie/1.rsc", 4 * MB, 1);
    const ignored = write("app/movie/page.js", 9 * MB, 1); // not a cache ext

    const ext = new Set([".html", ".rsc", ".meta"]);
    const r = pruneTarget("isr", [path.join(tmp, "app/movie")], 100 * MB, ext, NOW);

    expect(r.scanned).toBe(2); // page.js excluded
    expect(fs.existsSync(ignored)).toBe(true); // never touched
  });
});

describe("collectEntries", () => {
  it("returns empty for a missing root without throwing", () => {
    expect(collectEntries(path.join(tmp, "nope"), [], null)).toEqual([]);
  });
});

describe("removeEmptyDirs", () => {
  it("removes directories left empty after pruning", () => {
    const f = write("images/hash/only.webp", 1 * MB, 1);
    fs.unlinkSync(f);
    removeEmptyDirs(path.join(tmp, "images"));
    expect(fs.existsSync(path.join(tmp, "images/hash"))).toBe(false);
  });
});

describe("isrPrunePlan — bounded-isr backstop (Nov 16 2026)", () => {
  const GB = 1024 * MB;

  it("cron run with plenty of disk skips the walk (the handler bounds itself)", () => {
    const plan = isrPrunePlan({ BOUNDED_CACHE_MB: "6000" }, 10 * GB);
    expect(plan.walk).toBe(false);
    expect(plan.budgetBytes).toBe(6000 * MB);
  });

  it("cron run on a tight disk walks, pruning to the handler's own cap", () => {
    const plan = isrPrunePlan({ BOUNDED_CACHE_MB: "6000", PRUNE_MIN_FREE_MB: "4000" }, 3 * GB);
    expect(plan).toMatchObject({ walk: true, budgetBytes: 6000 * MB });
  });

  it("an explicit ISR_CACHE_BUDGET_MB (disk-guard, deploy preflight) always walks", () => {
    expect(isrPrunePlan({ ISR_CACHE_BUDGET_MB: "1500" }, 30 * GB)).toMatchObject({
      walk: true,
      budgetBytes: 1500 * MB,
    });
  });

  it("unknown free space fails safe (walks)", () => {
    expect(isrPrunePlan({}, null).walk).toBe(true);
  });
});

describe("run — prunes the real bounded-isr store", () => {
  it("emergency mode deletes the oldest bounded-isr entries, not .next/server/app", () => {
    const old = write(".next/cache/bounded-isr/BUILD1/a.json", 3 * MB, 10);
    const fresh = write(".next/cache/bounded-isr/BUILD1/b.json", 3 * MB, 1);
    const r = run(tmp, NOW, { ISR_CACHE_BUDGET_MB: "4", IMAGE_CACHE_BUDGET_MB: "100" });
    expect(fs.existsSync(old)).toBe(false);
    expect(fs.existsSync(fresh)).toBe(true);
    expect(r.rows.deleted).toBe(1);
    expect(r.isrWalked).toBe(true);
  });
});
