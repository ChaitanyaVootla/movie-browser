# Caching Implementation

## Status: Complete ✅ (Enhanced)

A unified L1 (in-memory) + L2 (file-based) caching system that survives server restarts and protects API quotas.

**Recent Enhancements:**
- ✅ Cache warming on server start
- ✅ Health endpoint with cache stats
- ✅ Compression for large payloads (>10KB)
- ✅ Prometheus-style metrics export

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         Request Flow                                     │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│   Request ──► L1 Check (memory) ──► HIT ──► Return immediately          │
│                     │                                                    │
│                    MISS                                                  │
│                     ▼                                                    │
│              L2 Check (file) ──► VALID ──► Populate L1, Return          │
│                     │                                                    │
│                   STALE (within grace)                                   │
│                     │                                                    │
│                     ├──► Return stale data immediately                  │
│                     └──► Trigger background refresh (non-blocking)      │
│                                                                          │
│                   EXPIRED (beyond grace)                                 │
│                     │                                                    │
│                     ▼                                                    │
│              In-Flight Check ──► EXISTS ──► Return same promise         │
│                     │                                                    │
│                    NEW                                                   │
│                     ▼                                                    │
│              Fetch from API ──► Store in L1 + L2 ──► Return             │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

## Key Features

| Feature | Description |
|---------|-------------|
| **L1 (Memory)** | Fast node-cache, configurable TTLs per namespace |
| **L2 (File)** | Persists to `.cache/` directory, survives restarts |
| **Stale-While-Revalidate** | Returns stale data instantly, refreshes in background |
| **Request Deduplication** | Multiple concurrent requests share one API call |
| **Cache Versioning** | Bump `CACHE_VERSION` to invalidate old cache on structure changes |
| **Async Writes** | File writes are non-blocking (fire-and-forget) |
| **Compression** | Payloads >10KB are gzip compressed (if >10% savings) |
| **Cache Warming** | L2 → L1 warming on server start for quota-sensitive data |
| **Prometheus Metrics** | Export metrics for monitoring dashboards |

## Full Architecture

All TMDB and YouTube API calls go through the unified cache:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        Application Layer                                     │
├─────────────────────────────────────────────────────────────────────────────┤
│  Server Actions               │  API Routes                                 │
│  - getTrending()              │  - /api/ai/chat                            │
│  - discoverBatch()            │  - /api/health                             │
│  - getUpcoming()              │  - /api/youtube                            │
│  - getYouTubeTrendingTrailers()                                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                        Service Layer                                         │
├─────────────────────────────────────────────────────────────────────────────┤
│  TMDB Service                 │  YouTube Services                           │
│  src/server/services/tmdb.ts  │  src/server/services/youtube.ts            │
│  - fetchFromTMDB()            │  src/server/services/youtube-channels.ts   │
│                               │  - getYouTubeChannelTrailers()             │
├─────────────────────────────────────────────────────────────────────────────┤
│                        Cache Layer                                           │
├─────────────────────────────────────────────────────────────────────────────┤
│  cachedFetchPersistent(namespace, key, fetcher)                             │
│  ┌─────────────┐    ┌─────────────┐    ┌──────────────────┐                │
│  │ L1 Memory   │ →  │ L2 File     │ →  │ External API     │                │
│  │ (node-cache)│    │ (.cache/)   │    │ (TMDB/YouTube)   │                │
│  └─────────────┘    └─────────────┘    └──────────────────┘                │
│        ↓                  ↓                    ↓                            │
│  - Fast (µs)         - Survives restart    - Slow (100ms+)                 │
│  - Lost on restart   - Compressed >10KB    - Rate limited                  │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Endpoint Coverage

Every external API call is cached. Here's the complete mapping:

### TMDB Endpoints → Cache Namespace

| Endpoint Function | Cache Namespace | TTL Constants |
|-------------------|-----------------|---------------|
| `getTrendingMovies()` | `trending` | 15 min |
| `getTrendingTV()` | `trending` | 15 min |
| `getTrendingAll()` | `trending` | 15 min |
| `getMovieDetails()` | `movie` | 1h L1, 2h L2 |
| `getMovieCollection()` | `movie` | 1h L1, 2h L2 |
| `getMovieImages()` | `images` | 1h L1, 24h L2 |
| `getMovieWatchProviders()` | `movie` | 1h L1, 2h L2 |
| `getSeriesDetails()` | `series` | 1h L1, 2h L2 |
| `getSeasonDetails()` | `series` | 1h L1, 2h L2 |
| `getEpisodeDetails()` | `series` | 1h L1, 2h L2 |
| `getSeriesImages()` | `images` | 1h L1, 24h L2 |
| `getSeriesWatchProviders()` | `series` | 1h L1, 2h L2 |
| `getPersonDetails()` | `person` | 24h L1, 3d L2 |
| `getPersonBasicInfo()` | `person` | 24h L1, 3d L2 |
| `searchMulti()` | `search` | 5m L1, 1h L2 |
| `searchPerson()` | `search` | 5m L1, 1h L2 |
| `searchKeyword()` | `search` | 5m L1, 1h L2 |
| `discoverMovies()` | `discover` | 30m L1, 1h L2 |
| `discoverTV()` | `discover` | 30m L1, 1h L2 |
| `getNowPlayingMovies()` | `trending` | 15 min |
| `getUpcomingMovies()` | `trending` | 15 min |
| `getTopRatedMovies()` | `trending` | 15 min |
| `getOnTheAirTV()` | `trending` | 15 min |
| `getAiringTodayTV()` | `trending` | 15 min |
| `getTopRatedTV()` | `trending` | 15 min |
| `getTrendingPeople()` | `trending` | 15 min |

### YouTube Endpoints → Cache Namespace

| Endpoint Function | Cache Namespace | TTL |
|-------------------|-----------------|-----|
| `getYouTubeVideoStats()` | `youtube` | 1h L1, 24h L2 |
| `getYouTubeComments()` | `youtube` | 1h L1, 24h L2 |
| `fetchChannelUploads()` | `youtube-channels` | 1h L1, 24h L2 |

## Namespace Configuration

| Namespace | L1 TTL | L2 TTL | Stale Grace | Use Case |
|-----------|--------|--------|-------------|----------|
| `youtube` | 1 hour | 24 hours | 1 hour | Video stats, comments, dislikes |
| `youtube-channels` | 1 hour | 24 hours | 2 hours | Channel uploads (trailer discovery) |
| `person` | 24 hours | 3 days | 24 hours | Person/actor data |
| `search` | 5 min | 1 hour | — | Search results |
| `discover` | 30 min | 1 hour | — | Browse/filter results |
| `movie` | 1 hour | 2 hours | — | Movie details |
| `series` | 1 hour | 2 hours | — | Series details |
| `images` | 1 hour | 24 hours | — | Image metadata |
| `trending` | 15 min | (none) | — | Trending content (no file cache) |

## File Structure

```
.cache/
├── youtube/
│   ├── a1b2c3d4e5f6...md5.json    # Video stats cache
│   └── ...
├── youtube-channels/
│   ├── f7e8d9c0b1a2...md5.json    # Channel uploads cache
│   └── ...
├── person/
├── search/
├── discover/
├── movie/
├── series/
└── images/
```

### Cache File Format

**Uncompressed entry (<10KB):**
```json
{
  "v": 1,                           // Cache version (for invalidation)
  "data": { ... },                  // Actual cached data
  "timestamp": 1704672000000,       // When cached
  "expiresAt": 1704758400000        // When it expires
}
```

**Compressed entry (>10KB with >10% savings):**
```json
{
  "v": 1,
  "data": "H4sIAAAAAAAAA...",       // Base64-encoded gzip data
  "timestamp": 1704672000000,
  "expiresAt": 1704758400000,
  "compressed": true,               // Flag indicating compression
  "originalSize": 52480             // Original size in bytes (for metrics)
}
```

## API Reference

### Core Functions

```typescript
import {
  cachedFetchPersistent,  // Main function - fetch with L1+L2 caching
  cachedFetch,            // Alias (backwards compatible)
  cacheGet,               // Direct cache read
  cacheSet,               // Direct cache write
  cacheDel,               // Delete from cache
  cacheFlushNamespace,    // Clear entire namespace
} from "@/lib/cache-service";

// Example: Fetch with caching
const data = await cachedFetchPersistent(
  "youtube",                        // namespace
  `stats:${videoId}`,              // cache key
  () => fetchFromYouTubeAPI(videoId) // fetcher function
);
```

### Utility Functions

```typescript
import {
  getCacheStats,          // Get hit rates and statistics
  getCacheSizeStats,      // Get file counts and sizes per namespace
  cleanupExpiredCache,    // Remove expired files (run via cron)
  getPrometheusMetrics,   // Export metrics in Prometheus format
  warmCache,              // Warm cache on server start
  isWarmingComplete,      // Check if warming is done
} from "@/lib/cache-service";

// Example: Get statistics
const stats = getCacheStats();
// { memory: {...}, custom: { l1Hits, l2Hits, staleHits, compressionSavings, ... }, hitRates: { l1: 0.85, l2: 0.92 }, uptime: { ms: 12345, human: "3h 25m" } }
```

## Key Design Decisions

### 1. Cache Key Design

Keys should be:
- **Unique**: Include all parameters that affect the result
- **Deterministic**: Same inputs = same key
- **Readable**: Easy to debug

```typescript
// Good: Includes all relevant parameters
const key = `channel:${channelId}:${maxResults}`;
const key = `stats:${videoIds.sort().join(",")}`;
const key = `discover:${JSON.stringify(params)}`;

// Bad: Missing parameters that affect result
const key = `channel:${channelId}`;  // Missing maxResults!
```

### 2. Namespace Separation

- L1 uses `namespace:key` format in memory
- L2 uses directory separation: `.cache/{namespace}/{md5(key)}.json`
- No collision possible across namespaces

### 3. Cache Versioning

When you change the data structure of cached items:

```typescript
// In cache-service.ts
const CACHE_VERSION = 2;  // Bump this!
```

All old cache files will be ignored on read (version mismatch).

### 4. Request Deduplication

Multiple concurrent requests for the same key share one API call:

```typescript
// Request 1: Creates promise, stores in inFlightRequests map
// Request 2: Gets same promise from map (no new API call)
// Request 3: Gets same promise from map
// Promise resolves: All 3 requests get same data
```

This is critical for YouTube quota protection.

## Deployment Notes

### Cache Persistence

The `.cache/` directory is:
- ✅ In `.gitignore` (not committed)
- ✅ **NOT** included in deploy tarball (preserves production cache)
- ✅ Created on EC2 by deploy script (`mkdir -p .cache/{namespaces}`)

### Server Restarts

1. L1 (memory) is lost on restart
2. L2 (file) survives and warms L1 on first request
3. Stale-while-revalidate prevents slow responses after restart

### Cache Cleanup

Run periodically to remove expired files:

```typescript
import { cleanupExpiredCache } from "@/lib/cache-service";

// Deletes files expired beyond their grace period
const { deleted, errors } = cleanupExpiredCache();
```

Consider adding a cron job or calling on a schedule.

## Monitoring

### Admin Dashboard

The admin dashboard (`/admin` → System tab) displays live cache metrics by reading directly from the cache service:
- L1 (memory) and L2 (file) hit rates
- Total hits/misses
- Memory keys count
- Compression savings
- Fetch errors

This provides **real-time** stats without relying on ClickHouse persistence.

### Check Cache Health (Code)

```typescript
const stats = getCacheStats();
console.log(`L1 hit rate: ${(stats.hitRates.l1 * 100).toFixed(1)}%`);
console.log(`L2 hit rate: ${(stats.hitRates.l2 * 100).toFixed(1)}%`);
console.log(`Stale hits: ${stats.custom.staleHits}`);
console.log(`Background refreshes: ${stats.custom.backgroundRefreshes}`);
```

### Check Cache Size

```typescript
const sizes = getCacheSizeStats();
for (const [ns, { files, sizeBytes }] of Object.entries(sizes)) {
  console.log(`${ns}: ${files} files, ${(sizeBytes / 1024).toFixed(1)} KB`);
}
```

## Migration from Old Cache

The old `cachedFetch` from `@/lib/cache` now re-exports from `cache-service`:

```typescript
// Old code (still works)
import { cachedFetch } from "@/lib/cache";

// New code (preferred)
import { cachedFetchPersistent } from "@/lib/cache-service";
```

Both use the same underlying L1+L2 cache system.

## Health Endpoint

The `/api/health` endpoint provides cache monitoring:

```bash
# Basic health check
curl https://yoursite.com/api/health
# Returns: { status: "healthy", cache: { hitRates: { l1: "85.2%", l2: "92.1%" }, ... } }

# Detailed stats
curl https://yoursite.com/api/health?format=detailed
# Returns: Full cache stats including per-namespace sizes

# Prometheus metrics
curl https://yoursite.com/api/health?format=prometheus
# Returns: Plain text Prometheus metrics
```

### Health Status

| Status | Condition |
|--------|-----------|
| `healthy` | Normal operation |
| `degraded` | L1 hit rate <50% after 100+ requests, or >10 fetch errors |

### Prometheus Metrics

Available metrics for Grafana/Prometheus dashboards:

```
cache_l1_hits_total
cache_l1_misses_total
cache_l2_hits_total
cache_l2_misses_total
cache_stale_hits_total
cache_background_refreshes_total
cache_compression_savings_bytes
cache_compressed_writes_total
cache_fetch_errors_total
cache_l1_hit_rate
cache_l2_hit_rate
cache_memory_keys
cache_uptime_seconds
cache_warming_complete
cache_namespace_files{namespace="youtube-channels"}
cache_namespace_bytes{namespace="youtube-channels"}
```

## Cache Warming

On server start, the cache automatically warms L1 from L2 for quota-sensitive namespaces.

### How It Works

1. **On startup** (`instrumentation.node.ts`): `warmCache()` is called
2. **L2 → L1 loading**: Reads file cache entries and populates memory
3. **Non-blocking**: Server starts handling requests while warming completes

**Note:** Only `instrumentation.node.ts` should exist. The `.node.ts` suffix ensures Next.js only loads it in Node.js runtime (not Edge), preventing errors with Node.js-only modules (fs, path, crypto, zlib).

### Warmed Namespaces

| Namespace | Why |
|-----------|-----|
| `youtube-channels` | Protects YouTube API quota (most critical) |
| `youtube` | Video stats |
| `person` | Large payloads, rarely change |
| `movie` | Movie details |
| `series` | Series details |

### Custom Warmers

You can add custom warmers that fetch fresh data on startup:

```typescript
await warmCache({
  namespaces: ["youtube-channels"],
  warmers: [
    {
      name: "trending",
      warmer: async () => {
        await getTrending(); // Pre-fetch trending data
      },
    },
  ],
});
```

## Compression

Payloads larger than 10KB are automatically gzip compressed before writing to L2 (file cache).

### How It Works

1. Serialize data to JSON
2. If size > 10KB, attempt gzip compression
3. Only use compression if it saves >10% (otherwise store uncompressed)
4. Store as base64-encoded string with `compressed: true` flag
5. On read, automatically decompress

### Metrics

Track compression effectiveness via:
- `compressionSavings`: Total bytes saved across all compressed entries
- `compressedWrites`: Number of entries that were compressed

## Future Improvements

- [ ] Add cache invalidation webhooks (e.g., when TMDB data updates)
- [ ] Add Redis L1 for multi-instance deployments
- [ ] Add cache preloading for specific high-traffic pages

