import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
// CJS script — exercised here for its pure prune logic (the top-level run is
// guarded by `require.main === module`, so importing does not execute it).
import { pruneTarget, collectEntries, removeEmptyDirs } from "./prune-isr-cache";

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
