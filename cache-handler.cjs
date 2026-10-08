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
const fs = require("fs");
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

/** Next's implicit+fetch tag header on APP_PAGE / APP_ROUTE values. */
const NEXT_CACHE_TAGS_HEADER = "x-next-cache-tags";

/**
 * Tags of an entry. Next 16 calls set() for APP_PAGE/APP_ROUTE WITHOUT
 * ctx.tags — a page's tags (incl. the implicit `_N_T_/<path>` tag that
 * revalidatePath() targets) live only in `value.headers["x-next-cache-tags"]`.
 * Reading only ctx.tags (the pre-Oct-2026 behaviour) made revalidatePath a
 * silent no-op for every cached page.
 */
function entryTags(ctx, value) {
  const tags = new Set((ctx && (ctx.tags || (ctx.cacheControl && ctx.cacheControl.tags))) || []);
  const header = value && value.headers && value.headers[NEXT_CACHE_TAGS_HEADER];
  if (typeof header === "string") {
    for (const t of header.split(",")) if (t) tags.add(t);
  }
  return [...tags];
}

function hashNameFor(key) {
  return crypto.createHash("sha1").update(key).digest("hex") + ".json";
}

const IMPLICIT_TAG_PREFIX = "_N_T_";

/**
 * Exact-path implicit tag → cache keys, or null.
 *
 * `revalidatePath(p)` (no type) emits `_N_T_<p>` (plus `_N_T_/index` for `/`),
 * and Next stores every page under its pathname — so these tags map straight
 * to cache keys with NO index scan. Derived route tags (`_N_T_/layout`,
 * `_N_T_/movie/layout`, `_N_T_/movie/[...params]/page`, `/route`) belong to
 * MANY pages and return null (→ bounded scan). A real pathname that happens to
 * end in /page|/layout|/route (e.g. `/u/page`) is ambiguous and also scans.
 * Format verified against next@16.1.0 server/lib/implicit-tags.js +
 * web/spec-extension/revalidate.js.
 */
function pathKeysForTag(tag) {
  if (typeof tag !== "string" || !tag.startsWith(IMPLICIT_TAG_PREFIX + "/")) return null;
  const p = tag.slice(IMPLICIT_TAG_PREFIX.length);
  if (p.includes("[")) return null;
  if (/\/(layout|page|route)$/.test(p)) return null;
  if (p === "/" || p === "/index") return ["/", "/index"];
  return [p.replace(/\/+$/, "") || "/"];
}

// Next's own in-memory tags manifest (what the default FileSystemCache
// updates). IncrementalCache.get() consults it for every entry — page entries
// via their x-next-cache-tags header, fetch entries via soft tags — so marking
// a tag here makes Next treat matching entries as stale/expired IMMEDIATELY,
// with zero I/O, for any tag shape. The `.external` module is a process
// singleton shared with Next's server runtime. Lost on restart (same as the
// default handler) — the durable deletes below cover that.
let nextTagsManifest = null;
try {
  nextTagsManifest = require("next/dist/server/lib/incremental-cache/tags-manifest.external")
    .tagsManifest;
} catch {
  nextTagsManifest = null;
}

/** Mirrors FileSystemCache.revalidateTag (next@16.1.0) exactly. */
function markTagsInNextManifest(tags, durations) {
  if (!nextTagsManifest || typeof nextTagsManifest.set !== "function") return;
  const now = Date.now();
  for (const tag of tags) {
    const existing = nextTagsManifest.get(tag) || {};
    if (durations) {
      const updates = { ...existing, stale: now };
      if (durations.expire !== undefined) updates.expired = now + durations.expire * 1000;
      nextTagsManifest.set(tag, updates);
    } else {
      nextTagsManifest.set(tag, { ...existing, expired: now });
    }
  }
}

// Bounded fallback scan for non-path tags. Prod holds ~300k entries / ~24GB;
// the old unbounded Promise.all(readFile+gunzip+parse) over the whole index
// would have put hundreds of thousands of buffers in flight (the Aug 18 and
// Sep heap-OOM outage classes). Now: SCAN_CONCURRENCY reads at a time, a yield
// to the event loop between batches, and a per-call read + time budget.
// Loaded tags are remembered on the index entry, so repeated scans make
// progress; anything not reached stays stale-until-revalidate (correctness is
// already immediate via the Next tags manifest above).
const SCAN_CONCURRENCY = 32;
const SCAN_MAX_READS = 20_000;
const SCAN_TIME_BUDGET_MS = 15_000;
const yieldToLoop = () => new Promise((resolve) => setImmediate(resolve));

/**
 * Drop the cached entries for exact cache keys (= route pathnames, e.g.
 * "/movie/157336/interstellar") from every live store — memory LRU, index,
 * and disk. The next request for that path renders fresh from PG. Used by
 * src/server/services/cdn (title content changed in a background refresh).
 * Never throws; resolves to the number of entries removed.
 */
async function invalidateKeys(keys) {
  let removed = 0;
  try {
    const list = Array.isArray(keys) ? keys : [keys];
    for (const store of STORES.values()) {
      try {
        await store.ready;
      } catch {
        /* pass-through store */
      }
      for (const key of list) {
        if (typeof key !== "string" || !key) continue;
        const hashName = hashNameFor(key);
        const mem = store.memory.get(hashName);
        if (mem) {
          store.memoryBytes -= mem.approxBytes;
          store.memory.delete(hashName);
        }
        const entry = store.index.get(hashName);
        if (entry) {
          store.index.delete(hashName);
          store.totalBytes -= entry.size;
        }
        const existed = await fsp
          .unlink(path.join(store.cacheDir, hashName))
          .then(() => true)
          .catch(() => false);
        if (entry || existed || mem) removed++;
      }
    }
  } catch {
    /* never throw — worst case the page stays stale until revalidate */
  }
  return removed;
}

// Process-wide registry so app code (bundled separately from this CJS file,
// possibly as a different module instance) reaches the SAME stores.
globalThis[Symbol.for("movie-browser.bounded-isr")] = { invalidateKeys };

/** Memoized BUILD_ID read — the handler is constructed per request, so the
 *  sync read must happen at most once per distDir. Falls back to "dev" when
 *  the file is missing (dev server, unit tests) for a stable namespace. */
const BUILD_ID_CACHE = new Map();
function readBuildId(distDir) {
  let id = BUILD_ID_CACHE.get(distDir);
  if (!id) {
    try {
      id =
        fs.readFileSync(path.join(distDir, "BUILD_ID"), "utf8").trim() || "dev";
    } catch {
      id = "dev";
    }
    BUILD_ID_CACHE.set(distDir, id);
  }
  return id;
}

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
    // Namespace entries by BUILD_ID (Jun 12 2026): .next/cache survives both
    // `next build` and the deploy tar (extracted OVER .next), and entries are
    // keyed by route path only — so after a deploy the handler kept serving
    // the PREVIOUS build's HTML (whose chunk URLs can 404, and which kept the
    // Jun 12 broken-hydration HTML alive long after the fixed build shipped).
    // A per-build subdirectory makes a new build start from an empty namespace
    // (cold ISR after deploy is absorbed by CloudFront); stale build dirs are
    // pruned once at store init.
    const distDir = path.join(serverDistDir, "..");
    this.buildId = readBuildId(distDir);
    this.cacheDir = path.join(distDir, "cache", "bounded-isr", this.buildId);
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
        cacheDir: this.cacheDir,
        /** @type {Map<string, {file: string, size: number, lastAccess: number, tags: string[] | null}>} */
        index: new Map(), // insertion order ≈ LRU order (re-inserted on access)
        totalBytes: 0,
        /** single-flight chain of background tag scans */
        scan: Promise.resolve(),
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
    return path.join(this.cacheDir, hashNameFor(key));
  }

  async #initIndex(store) {
    try {
      await fsp.mkdir(this.cacheDir, { recursive: true });
      // Best-effort, once per process: remove other builds' namespaces and
      // legacy flat *.json entries from the pre-namespacing scheme — they are
      // unreachable now and would otherwise sit in the disk budget forever.
      const parent = path.dirname(this.cacheDir);
      fsp
        .readdir(parent)
        .then((siblings) => {
          for (const name of siblings) {
            if (name === this.buildId) continue;
            fsp
              .rm(path.join(parent, name), { recursive: true, force: true })
              .catch(() => {});
          }
        })
        .catch(() => {});
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

  async #readEntryTags(entry) {
    try {
      const raw = await fsp.readFile(path.join(this.cacheDir, entry.file));
      const text =
        raw[0] === GZIP_MAGIC_0 && raw[1] === GZIP_MAGIC_1
          ? (await gunzipAsync(raw)).toString("utf8")
          : raw.toString("utf8");
      const stored = deserialize(text);
      entry.tags = entryTags({ tags: stored.tags }, stored.value);
    } catch {
      entry.tags = [];
    }
  }

  /**
   * Drop every entry carrying any of `wanted`, loading unknown (post-restart)
   * tags in bounded batches. Never more than SCAN_CONCURRENCY reads in flight.
   */
  async #scanAndDrop(wanted) {
    const started = Date.now();
    let reads = 0;
    const hashNames = Array.from(this.store.index.keys());
    for (let i = 0; i < hashNames.length; i += SCAN_CONCURRENCY) {
      const batch = [];
      for (const hashName of hashNames.slice(i, i + SCAN_CONCURRENCY)) {
        const entry = this.store.index.get(hashName);
        if (entry) batch.push([hashName, entry]);
      }
      const unknown = batch.filter(([, e]) => e.tags === null);
      if (unknown.length) {
        if (reads >= SCAN_MAX_READS || Date.now() - started > SCAN_TIME_BUDGET_MS) {
          // Out of budget: entries with KNOWN tags can still be matched cheaply.
          for (const [hashName, entry] of batch) {
            if (entry.tags !== null) await this.#dropIfTagged(hashName, entry, wanted);
          }
          continue;
        }
        reads += unknown.length;
        await Promise.all(unknown.map(([, e]) => this.#readEntryTags(e)));
      }
      for (const [hashName, entry] of batch) await this.#dropIfTagged(hashName, entry, wanted);
      await yieldToLoop();
    }
  }

  async #dropIfTagged(hashName, entry, wanted) {
    const entryTagList = entry.tags || [];
    if (!wanted.some((t) => entryTagList.includes(t))) return;
    if (this.store.index.get(hashName) !== entry) return; // replaced meanwhile
    this.store.index.delete(hashName);
    this.#memoryDelete(hashName);
    this.store.totalBytes -= entry.size;
    await fsp.unlink(path.join(this.cacheDir, entry.file)).catch(() => {});
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
    const unlinks = [];
    for (const [hashName, entry] of this.store.index) {
      if (this.store.totalBytes <= this.lowWatermark) break;
      this.store.index.delete(hashName);
      this.#memoryDelete(hashName);
      this.store.totalBytes -= entry.size;
      unlinks.push(fsp.unlink(path.join(this.cacheDir, entry.file)).catch(() => {}));
    }
    // Await so accounting matches disk state (also makes tests deterministic).
    await Promise.all(unlinks);
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
      const tags = entryTags(ctx, data);
      const serialized = serialize({
        lastModified: Date.now(),
        tags,
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
        tags,
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

  /**
   * 1. Mark the tags in Next's tags manifest (immediate, zero I/O, any tag).
   * 2. Exact-path tags (what revalidatePath emits) → delete those cache keys
   *    directly — no index scan, durable across restarts.
   * 3. Any other tag → bounded background scan (single-flight, not awaited).
   * With a cache-life profile (`durations`, stale-while-revalidate semantics)
   * only step 1 runs — deleting would turn "serve stale once" into "expire".
   */
  async revalidateTag(tags, durations) {
    try {
      await this.store.ready;
      const wanted = (Array.isArray(tags) ? tags : [tags]).filter(
        (t) => typeof t === "string" && t,
      );
      if (wanted.length === 0) return;
      markTagsInNextManifest(wanted, durations);
      if (durations) return;
      const keys = [];
      const scanTags = [];
      for (const tag of wanted) {
        const k = pathKeysForTag(tag);
        if (k) keys.push(...k);
        else scanTags.push(tag);
      }
      if (keys.length) await invalidateKeys(keys);
      if (scanTags.length) {
        this.store.scan = this.store.scan
          .then(() => this.#scanAndDrop(scanTags))
          .catch(() => {});
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
module.exports._internals = { serialize, deserialize, BUFFER_TAG, entryTags, pathKeysForTag, SCAN_CONCURRENCY };
module.exports.invalidateKeys = invalidateKeys;
// Test-only: reset singleton state between cases (simulates a process restart).
module.exports._clearStores = () => STORES.clear();
