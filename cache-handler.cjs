/**
 * Bounded disk cache handler for Next.js ISR (`cacheHandler` in next.config).
 *
 * WHY (Jun 10 2026 outage): Next's default file-system ISR cache has NO size
 * limit or eviction — bots crawling the 800k-title long tail grew it to 41GB,
 * filled the disk (ENOSPC) and crash-looped next-server for hours. This
 * handler replaces the default store with an LRU-evicting one: the cache can
 * never exceed BOUNDED_CACHE_MB on disk, enforced at write time.
 *
 * Design constraints:
 * - Plain CJS, zero dependencies (loaded by the Next server outside the
 *   bundle; must also be shipped in the deploy tar — see deploy-ec2.yml).
 * - NEVER throws: any internal failure degrades to a cache miss (page
 *   re-renders) — a cache bug must not be able to take the site down again.
 * - Storage: one JSON file per entry in .next/cache/bounded-isr/. Buffers
 *   inside cached values (rscData, route bodies) are base64-tagged.
 * - LRU index is in-memory; on cold start it is rebuilt from a directory
 *   stat-scan (sizes + mtimes only). Tags are stored inside each entry file
 *   and loaded lazily on the first revalidateTag call after boot.
 *
 * Env: BOUNDED_CACHE_MB (default 4000).
 */

/* eslint-disable @typescript-eslint/no-require-imports -- runtime CJS, loaded by the Next server outside the bundle */
const fsp = require("fs/promises");
const path = require("path");
const crypto = require("crypto");

// Budget/limits resolve in the constructor (not module load) so env is read
// when the server actually constructs the handler — also keeps tests honest.

const BUFFER_TAG = "__bisr_b64__";
const MAP_TAG = "__bisr_map__";

// Next 16 APP_PAGE values contain `segmentData: Map<string, Buffer>` (RSC
// segment prefetch data). Naive JSON flattens Maps to {} and cache hits then
// crash the router with "segmentData.get is not a function" — both Maps and
// Buffers are tag-encoded so they survive the round-trip.
function serialize(value) {
  return JSON.stringify(value, function (_k, v) {
    // `v` is post-toJSON; recover the raw value to detect Maps reliably.
    const raw = this ? this[_k] : v;
    if (raw instanceof Map) return { [MAP_TAG]: [...raw.entries()] };
    if (v && v.type === "Buffer" && Array.isArray(v.data)) {
      // JSON.stringify sees Buffers pre-converted via Buffer.toJSON()
      return { [BUFFER_TAG]: Buffer.from(v.data).toString("base64") };
    }
    return v;
  });
}

function deserialize(text) {
  return JSON.parse(text, (_k, v) => {
    if (v && typeof v === "object") {
      if (typeof v[BUFFER_TAG] === "string") {
        return Buffer.from(v[BUFFER_TAG], "base64");
      }
      if (Array.isArray(v[MAP_TAG])) {
        return new Map(v[MAP_TAG]); // children (incl. Buffers) already revived
      }
    }
    return v;
  });
}

class BoundedCacheHandler {
  constructor(ctx) {
    const serverDistDir =
      (ctx && ctx.serverDistDir) || path.join(process.cwd(), ".next", "server");
    this.cacheDir = path.join(serverDistDir, "..", "cache", "bounded-isr");
    this.budgetBytes =
      parseInt(process.env.BOUNDED_CACHE_MB || "4000", 10) * 1024 * 1024;
    // Evict down to 90% of budget so a full cache doesn't evict one file per
    // write (write-amplification under sustained crawl).
    this.lowWatermark = Math.floor(this.budgetBytes * 0.9);
    // Hot-page memory layer: with a custom cacheHandler Next bypasses its own
    // in-memory LRU, so without this every hit costs a disk read + JSON parse.
    // Sized in entries (a cached detail page is ~100-300KB → ~50-150MB).
    this.memoryEntries = parseInt(
      process.env.BOUNDED_CACHE_MEM_ENTRIES || "500",
      10,
    );
    /** @type {Map<string, {file: string, size: number, lastAccess: number, tags: string[] | null}>} */
    this.index = new Map(); // insertion order ≈ LRU order (re-inserted on access)
    this.totalBytes = 0;
    this.tagsLoaded = false;
    /** @type {Map<string, {lastModified: number, value: unknown}>} hot-page LRU */
    this.memory = new Map();
    this.ready = this.#initIndex();
  }

  #memoryGet(hashName) {
    const hit = this.memory.get(hashName);
    if (hit) {
      this.memory.delete(hashName);
      this.memory.set(hashName, hit); // refresh LRU position
    }
    return hit;
  }

  #memorySet(hashName, stored) {
    this.memory.delete(hashName);
    this.memory.set(hashName, stored);
    while (this.memory.size > this.memoryEntries) {
      this.memory.delete(this.memory.keys().next().value);
    }
  }

  #fileFor(key) {
    return path.join(
      this.cacheDir,
      crypto.createHash("sha1").update(key).digest("hex") + ".json",
    );
  }

  async #initIndex() {
    try {
      await fsp.mkdir(this.cacheDir, { recursive: true });
      const names = await fsp.readdir(this.cacheDir);
      const stats = [];
      for (const name of names) {
        if (!name.endsWith(".json")) continue;
        try {
          const st = await fsp.stat(path.join(this.cacheDir, name));
          stats.push({ name, size: st.size, mtimeMs: st.mtimeMs });
        } catch {
          /* raced unlink */
        }
      }
      stats.sort((a, b) => a.mtimeMs - b.mtimeMs); // oldest first = LRU head
      for (const s of stats) {
        // Key is unknown after restart (filenames are hashes) — index by file
        // hash; get()/set() address entries via #fileFor(key) hashes anyway.
        this.index.set(s.name, {
          file: s.name,
          size: s.size,
          lastAccess: s.mtimeMs,
          tags: null, // lazy-loaded on first revalidateTag
        });
        this.totalBytes += s.size;
      }
    } catch {
      // Cache dir unusable — run as a pass-through (all misses).
      this.index = new Map();
      this.totalBytes = 0;
    }
  }

  async #loadTagsIfNeeded() {
    if (this.tagsLoaded) return;
    this.tagsLoaded = true; // set first so concurrent calls don't double-scan
    const loads = [];
    for (const entry of this.index.values()) {
      if (entry.tags !== null) continue;
      loads.push(
        fsp
          .readFile(path.join(this.cacheDir, entry.file), "utf8")
          .then((text) => {
            entry.tags = deserialize(text).tags || [];
          })
          .catch(() => {
            entry.tags = [];
          }),
      );
    }
    await Promise.all(loads);
  }

  #touch(hashName, entry) {
    // Re-insert to move to the tail of Map iteration order (most recent).
    this.index.delete(hashName);
    entry.lastAccess = Date.now();
    this.index.set(hashName, entry);
  }

  async #evictToWatermark() {
    if (this.totalBytes <= this.budgetBytes) return;
    for (const [hashName, entry] of this.index) {
      if (this.totalBytes <= this.lowWatermark) break;
      this.index.delete(hashName);
      this.memory.delete(hashName);
      this.totalBytes -= entry.size;
      fsp.unlink(path.join(this.cacheDir, entry.file)).catch(() => {});
    }
  }

  async get(key) {
    try {
      await this.ready;
      const file = this.#fileFor(key);
      const hashName = path.basename(file);
      const memHit = this.#memoryGet(hashName);
      if (memHit) {
        const entry = this.index.get(hashName);
        if (entry) this.#touch(hashName, entry);
        return { lastModified: memHit.lastModified, value: memHit.value };
      }
      const text = await fsp.readFile(file, "utf8").catch(() => null);
      if (text === null) {
        // mirror index if file vanished externally (prune job, manual rm)
        const stale = this.index.get(hashName);
        if (stale) {
          this.index.delete(hashName);
          this.totalBytes -= stale.size;
        }
        return null;
      }
      const stored = deserialize(text);
      const entry = this.index.get(hashName);
      if (entry) this.#touch(hashName, entry);
      this.#memorySet(hashName, stored);
      return { lastModified: stored.lastModified, value: stored.value };
    } catch {
      return null; // any failure = cache miss
    }
  }

  async set(key, data, ctx) {
    try {
      await this.ready;
      const file = this.#fileFor(key);
      const hashName = path.basename(file);
      const payload = serialize({
        lastModified: Date.now(),
        tags: (ctx && (ctx.tags || ctx.cacheControl?.tags)) || [],
        value: data,
      });
      const size = Buffer.byteLength(payload);
      if (size > this.budgetBytes) return; // absurd single entry — skip, render uncached
      await fsp.writeFile(file, payload);
      const prev = this.index.get(hashName);
      if (prev) this.totalBytes -= prev.size;
      this.index.delete(hashName);
      this.index.set(hashName, {
        file: hashName,
        size,
        lastAccess: Date.now(),
        tags: (ctx && (ctx.tags || ctx.cacheControl?.tags)) || [],
      });
      this.totalBytes += size;
      this.#memorySet(hashName, { lastModified: Date.now(), value: data });
      await this.#evictToWatermark();
    } catch {
      // Write failed (ENOSPC etc.) — try to shed weight, never throw.
      try {
        await this.#evictToWatermark();
      } catch {
        /* give up silently — behaves as uncached */
      }
    }
  }

  async revalidateTag(tags) {
    try {
      await this.ready;
      const wanted = Array.isArray(tags) ? tags : [tags];
      if (wanted.length === 0) return;
      await this.#loadTagsIfNeeded();
      for (const [hashName, entry] of [...this.index]) {
        const entryTags = entry.tags || [];
        if (wanted.some((t) => entryTags.includes(t))) {
          this.index.delete(hashName);
          this.memory.delete(hashName);
          this.totalBytes -= entry.size;
          await fsp.unlink(path.join(this.cacheDir, entry.file)).catch(() => {});
        }
      }
    } catch {
      /* failed revalidation degrades to stale-until-revalidate */
    }
  }

  resetRequestCache() {
    // per-request memory cache not implemented — nothing to reset
  }
}

module.exports = BoundedCacheHandler;
// Exported for unit tests:
module.exports._internals = { serialize, deserialize, BUFFER_TAG };
