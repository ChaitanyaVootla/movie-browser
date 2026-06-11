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
const zlib = require("zlib");
const { promisify } = require("util");

// ASYNC zlib only — gzipSync/gunzipSync on the request path blocked the event
// loop under concurrent crawler load (Jun 11: 40s without serving a byte).
const gzipAsync = promisify(zlib.gzip);
const gunzipAsync = promisify(zlib.gunzip);

// Entries are stored gzipped: a cached detail page is ~340KB raw (HTML +
// RSC flight + segment prefetch copies of the same data) and ~6× smaller
// compressed — the same disk budget holds ~6× more pages. Read path also
// accepts legacy plain-JSON entries (pre-gzip deploys) via magic-byte sniff.
/** Per-cacheDir singleton stores — survive per-request handler construction. */
const STORES = new Map();

const GZIP_MAGIC_0 = 0x1f;
const GZIP_MAGIC_1 = 0x8b;

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
    // in-memory LRU, so without this every hit costs a disk read + parse.
    // BYTE-budgeted (NOT entry-count): deserialized page objects are ~1MB+ in
    // JS heap each — an entry-count cap of 500 grew RSS to 2.3GB and put the
    // process into a GC death spiral (Jun 11). Sizes are approximated by each
    // entry's serialized length, so keep the budget conservative.
    this.memoryBudgetBytes =
      parseInt(process.env.BOUNDED_CACHE_MEM_MB || "48", 10) * 1024 * 1024;
    // CRITICAL: state is a module-level singleton per cacheDir — Next
    // constructs the cache handler PER REQUEST, and per-instance state made
    // every request stat-scan the whole cache dir (#initIndex), flooding the
    // libuv threadpool and starving all fs I/O (Jun 11, found via perf:
    // uv_fs_stat storms). The scan must run ONCE per process.
    let store = STORES.get(this.cacheDir);
    if (!store) {
      store = {
        /** @type {Map<string, {file: string, size: number, lastAccess: number, tags: string[] | null}>} */
        index: new Map(), // insertion order ≈ LRU order (re-inserted on access)
        totalBytes: 0,
        tagsLoaded: false,
        /** @type {Map<string, {lastModified: number, value: unknown, approxBytes: number}>} hot-page LRU */
        memory: new Map(),
        memoryBytes: 0,
        ready: null,
      };
      STORES.set(this.cacheDir, store);
      store.ready = this.#initIndex(store);
    }
    this.store = store;
  }

  #memoryGet(hashName) {
    const hit = this.store.memory.get(hashName);
    if (hit) {
      this.store.memory.delete(hashName);
      this.store.memory.set(hashName, hit); // refresh LRU position
    }
    return hit;
  }

  #memorySet(hashName, stored, approxBytes) {
    const prev = this.store.memory.get(hashName);
    if (prev) this.store.memoryBytes -= prev.approxBytes;
    this.store.memory.delete(hashName);
    this.store.memory.set(hashName, { ...stored, approxBytes });
    this.store.memoryBytes += approxBytes;
    while (this.store.memoryBytes > this.memoryBudgetBytes && this.store.memory.size > 1) {
      const oldestKey = this.store.memory.keys().next().value;
      const oldest = this.store.memory.get(oldestKey);
      this.store.memoryBytes -= oldest.approxBytes;
      this.store.memory.delete(oldestKey);
    }
  }

  #fileFor(key) {
    return path.join(
      this.cacheDir,
      crypto.createHash("sha1").update(key).digest("hex") + ".json",
    );
  }

  async #initIndex(store) {
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
        store.index.set(s.name, {
          file: s.name,
          size: s.size,
          lastAccess: s.mtimeMs,
          tags: null, // lazy-loaded on first revalidateTag
        });
        store.totalBytes += s.size;
      }
    } catch {
      // Cache dir unusable — run as a pass-through (all misses).
      store.index = new Map();
      store.totalBytes = 0;
    }
  }

  async #loadTagsIfNeeded() {
    if (this.store.tagsLoaded) return;
    this.store.tagsLoaded = true; // set first so concurrent calls don't double-scan
    const loads = [];
    for (const entry of this.store.index.values()) {
      if (entry.tags !== null) continue;
      loads.push(
        fsp
          .readFile(path.join(this.cacheDir, entry.file))
          .then(async (raw) => {
            const text =
              raw[0] === GZIP_MAGIC_0 && raw[1] === GZIP_MAGIC_1
                ? (await gunzipAsync(raw)).toString("utf8")
                : raw.toString("utf8");
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
    this.store.index.delete(hashName);
    entry.lastAccess = Date.now();
    this.store.index.set(hashName, entry);
  }

  #memoryDelete(hashName) {
    const hit = this.store.memory.get(hashName);
    if (hit) {
      this.store.memoryBytes -= hit.approxBytes;
      this.store.memory.delete(hashName);
    }
  }

  async #evictToWatermark() {
    if (this.store.totalBytes <= this.budgetBytes) return;
    for (const [hashName, entry] of this.store.index) {
      if (this.store.totalBytes <= this.lowWatermark) break;
      this.store.index.delete(hashName);
      this.#memoryDelete(hashName);
      this.store.totalBytes -= entry.size;
      fsp.unlink(path.join(this.cacheDir, entry.file)).catch(() => {});
    }
  }

  async get(key) {
    try {
      await this.store.ready;
      const file = this.#fileFor(key);
      const hashName = path.basename(file);
      const memHit = this.#memoryGet(hashName);
      if (memHit) {
        const entry = this.store.index.get(hashName);
        if (entry) this.#touch(hashName, entry);
        return { lastModified: memHit.lastModified, value: memHit.value };
      }
      const raw = await fsp.readFile(file).catch(() => null);
      if (raw === null) {
        // mirror index if file vanished externally (prune job, manual rm)
        const stale = this.store.index.get(hashName);
        if (stale) {
          this.store.index.delete(hashName);
          this.store.totalBytes -= stale.size;
        }
        return null;
      }
      const text =
        raw[0] === GZIP_MAGIC_0 && raw[1] === GZIP_MAGIC_1
          ? (await gunzipAsync(raw)).toString("utf8")
          : raw.toString("utf8"); // legacy pre-gzip entry
      const stored = deserialize(text);
      const entry = this.store.index.get(hashName);
      if (entry) this.#touch(hashName, entry);
      this.#memorySet(hashName, stored, Buffer.byteLength(text));
      return { lastModified: stored.lastModified, value: stored.value };
    } catch {
      return null; // any failure = cache miss
    }
  }

  async set(key, data, ctx) {
    try {
      await this.store.ready;
      const file = this.#fileFor(key);
      const hashName = path.basename(file);
      const serialized = serialize({
        lastModified: Date.now(),
        tags: (ctx && (ctx.tags || ctx.cacheControl?.tags)) || [],
        value: data,
      });
      // level 4: ~6x reduction with modest CPU; MUST stay async (see header)
      const payload = await gzipAsync(serialized, { level: 4 });
      const size = payload.length;
      if (size > this.budgetBytes) return; // absurd single entry — skip, render uncached
      await fsp.writeFile(file, payload);
      const prev = this.store.index.get(hashName);
      if (prev) this.store.totalBytes -= prev.size;
      this.store.index.delete(hashName);
      this.store.index.set(hashName, {
        file: hashName,
        size,
        lastAccess: Date.now(),
        tags: (ctx && (ctx.tags || ctx.cacheControl?.tags)) || [],
      });
      this.store.totalBytes += size;
      this.#memorySet(
        hashName,
        { lastModified: Date.now(), value: data },
        Buffer.byteLength(serialized),
      );
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
      await this.store.ready;
      const wanted = Array.isArray(tags) ? tags : [tags];
      if (wanted.length === 0) return;
      await this.#loadTagsIfNeeded();
      for (const [hashName, entry] of [...this.store.index]) {
        const entryTags = entry.tags || [];
        if (wanted.some((t) => entryTags.includes(t))) {
          this.store.index.delete(hashName);
          this.#memoryDelete(hashName);
          this.store.totalBytes -= entry.size;
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
// Test-only: reset singleton state between cases (simulates a process restart).
module.exports._clearStores = () => STORES.clear();
