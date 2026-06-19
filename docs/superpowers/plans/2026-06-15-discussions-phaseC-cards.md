# Discussions Phase C — Link & Trailer Cards (TDD Implementation Plan)

**Date:** 2026-06-15
**Branch:** `feat/social-phase0` (LOCAL ONLY — NEVER push origin; pushing `next` auto-deploys prod)
**Spec:** `docs/superpowers/specs/2026-06-15-discussions-positioning-design.md` (§5 rung 4, §6 rendering safety, §10 `link_unfurls`)
**Depends on:** Phases A + B (assumed DONE on this branch).

---

## Goal

Render rich, **safe** link content inside discussion comments:

1. **SSRF-hardened server-side unfurl service** — given a URL, fetch its OG/oEmbed
   metadata into `{title, description, image, domain, favicon}`. Hard timeout (~2s),
   scheme allowlist (`http`/`https` only), block RFC1918 / loopback / link-local
   **after DNS resolution**, cap redirects, **fail open** (a plain safe anchor on any
   error/timeout). Reuses the discipline of the proxy slug-resolver
   (`src/server/proxy/media-resolver.ts`: 2s `AbortController`, fail-open, never throw
   on the render path).
2. **`link_unfurls` cache table** keyed by a URL-hash so an unfurl is fetched **once**
   (on comment submit / first encounter) and **NEVER refetched on a render or crawl
   path**. This keeps the cacheable RSC HTML free of any network work.
3. **Comment rendering** — turn the FIRST unfurlable URL in a published comment into a
   server-rendered preview card (read purely from the cached `link_unfurls` row).
   Bare/unsafe/un-cached links keep rendering as text anchors with
   `rel="nofollow ugc noopener noreferrer" target="_blank"`.
4. **YouTube via a click-to-load FACADE** — a thumbnail that, on click, swaps in a
   `youtube-nocookie.com` iframe. NEVER a raw user-controlled iframe.
5. **CSP additions** — introduce a `Content-Security-Policy` header in
   `next.config.mjs` with a `frame-src` allowlist (`youtube-nocookie.com`) and an
   `img-src` allowlist (TMDB CDN + our image CDN + YouTube thumbnail host). **No CSP
   exists in the repo today** (verified — neither `next.config.mjs` nor `Caddyfile`),
   so this is additive. We verify it does not regress the existing trailer embeds
   (`video-gallery.tsx`, `trailer-modal.tsx` already use `youtube-nocookie.com` /
   `youtube.com/embed`).

### Scope decision on unfurl-card images (spec §5 / rung 7 deferral)

The spec defers the SSRF-hardened **image proxy** (rung 7). Per the prompt we take
**option (a)**: for arbitrary external links, the card shows **text + domain + favicon
only** (favicon via Google's `s2/favicons` endpoint, a single known-safe host — NOT a
hotlink to an arbitrary attacker-controlled domain). Rich preview **images** are
reserved for **known-safe providers** whose image host we already allowlist:
- **YouTube** → `img.youtube.com` thumbnail (already an allowed `img-src` for the
  existing trailer gallery) + the lite-YouTube facade.
- (TMDB / our own CDN imagery is the `@entity` / catalog-image-picker path — Phase B,
  out of scope here.)

We **store** the OG `image` URL in `link_unfurls.imageUrl` for forward-compat, but the
v1 card renderer does NOT emit an `<img>` for it unless the host is in the allowlist.
This is called out as a follow-up (rung 7) in the card component.

---

## Architecture

```
submit comment ─► createComment (comments.ts, Phase A/B)
                    │
                    └─ AFTER publish, fire-and-forget:
                       enqueueUnfurl(firstLinkUrl)  ── services/discussion/unfurl.ts
                          │  (rate-limited reuse of discussion/rate-limit pattern not needed;
                          │   bounded by comment volume — one unfurl per submit at most)
                          ├─ normalizeUrl + urlHash (sha256)
                          ├─ getCachedUnfurl(urlHash)  → hit? done.
                          └─ miss → fetchUnfurl(url)  [SSRF-HARDENED]
                                      ├─ scheme allowlist (http/https)
                                      ├─ DNS resolve → assertPublicIp(addresses)  ── ssrf-guard.ts
                                      ├─ fetch w/ 2s AbortController, redirect:"manual", cap 3 hops
                                      │     (each redirect Location re-runs the SSRF guard)
                                      ├─ parse OG/oEmbed via cheerio  ── og-parse.ts
                                      └─ upsert link_unfurls (status OK | FAILED, fail-open)

render comment (RSC, ISR-cacheable) ─► CommentBody
                    │  reads ONLY cached link_unfurls rows passed in via the DTO
                    │  (NO network, NO auth/headers — edge-cache invariant intact)
                    └─ LinkCard (server component)  ── components/features/discussion/link-card.tsx
                         ├─ YouTube url + OK row → <LiteYouTube/>  (client island, click-to-load)
                         ├─ OK row (non-YT)      → text+domain+favicon card
                         └─ no/failed row        → plain <a rel="nofollow ugc noopener noreferrer">
```

**Key invariants honored:**
- **No AI** anywhere in this phase.
- **No SSRF** — DNS-resolved IP check + scheme allowlist + redirect cap + 2s timeout.
- **No network on the render/crawl path** — cards render from the cached table only.
- **Edge-cache** — `link_unfurls` rows carry no viewer data; cards are static server
  HTML, safe in ISR. No `auth()`/`headers()` added to any render tree.
- **No raw user HTML / iframe** — YouTube is a facade; bodies stay text (Phase B owns
  `react-markdown` + `sanitize-html`; this phase touches neither).
- **DESIGN.md** — card uses `@/lib/design` tokens, semantic colors, ≥40px touch
  targets, mobile-first.
- **No `any`** — `unknown` + type guards / Zod throughout.

## Tech Stack

- Prisma 6 model `LinkUnfurl` (`@@map("link_unfurls")`), keyed by `urlHash` (sha256 hex).
- `cheerio` (ALREADY a dependency) for OG/oEmbed `<meta>` parsing.
- Node `dns/promises` + `node:net` (`isIP`) for SSRF resolution checks (no new dep).
- Node `node:crypto` `createHash` for the URL hash (no new dep).
- `react-lite-youtube-embed` (NEW dep) for the click-to-load facade.
- `vitest` + `happy-dom` (existing config) for unit tests.

### New dependencies

```bash
yarn add react-lite-youtube-embed
```

(`react-lite-youtube-embed` bundles its own CSS-in-JS-free styles; it renders a
thumbnail `<button>` and only injects the `youtube-nocookie.com` iframe on click —
exactly the facade the spec asks for. No raw iframe is ever user-controlled.)

> No `sanitize-html` / `obscenity` / `react-markdown` work here — those are Phase B.

---

## For agentic workers

Execute with **`superpowers:subagent-driven-development`**: dispatch each task below to
a fresh subagent with the task's exact text. Tasks are ordered; later tasks import
types/functions from earlier ones, so run **sequentially** (they share files). Each
task is a complete TDD micro-cycle: write the failing test → run it (confirm RED) →
write the minimal implementation with the **complete code given here** → run the test
(confirm GREEN) → `yarn typecheck` → commit. Do not improvise code that isn't in the
task; if a task seems wrong, stop and report rather than gold-plate.

**Pinned commands (every task uses these — the dev DB lives on :5436, NEVER prod):**

```bash
# unit test (single file)
DATABASE_URL='postgresql://dev:dev@localhost:5436/moviebrowser' yarn vitest run <path>
# typecheck (whole project)
yarn typecheck
# after a prisma schema change ONLY:
DATABASE_URL='postgresql://dev:dev@localhost:5436/moviebrowser' yarn db:push
npx pm2 restart mb-dev        # stale generated client rejects new columns as "Unknown argument"
```

**Commit message footer (every commit):**

```
Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
```

**NEVER `git push`.** All work stays local on `feat/social-phase0`.

---

## File Structure

```
prisma/schema.prisma                                         (EDIT: + model LinkUnfurl)
src/server/services/discussion/
  ├── ssrf-guard.ts                                          (NEW) pure IP/scheme guards
  ├── ssrf-guard.test.ts                                     (NEW) rejects private/link-local; fail-open
  ├── url-normalize.ts                                       (NEW) normalizeUrl + urlHash + extractFirstLink + youtube id
  ├── url-normalize.test.ts                                  (NEW)
  ├── og-parse.ts                                            (NEW) cheerio OG/oEmbed → UnfurlMeta (pure)
  ├── og-parse.test.ts                                       (NEW)
  ├── unfurl.ts                                              (NEW) fetchUnfurl (SSRF) + getCachedUnfurl + enqueueUnfurl
  └── unfurl.test.ts                                         (NEW) end-to-end fetch w/ injected deps (no real net)
src/server/db/postgres/social/link-unfurls.ts                (NEW) upsertUnfurl / getUnfurlsByUrls + LinkUnfurlDto
src/server/actions/comments.ts                               (EDIT: fire enqueueUnfurl after publish)
src/server/db/postgres/comments.ts                           (EDIT: hydrate unfurl rows into CommentDto.linkCard)
src/components/features/discussion/
  ├── link-card.tsx                                          (NEW) server component: card vs anchor
  ├── lite-youtube.tsx                                       (NEW) "use client" facade wrapper
  └── comment-item.tsx                                       (EDIT: render <LinkCard> below body)
next.config.mjs                                              (EDIT: + Content-Security-Policy header)
```

---

## Tasks

### Task 1 — `LinkUnfurl` Prisma model + DB layer

**1a. Failing test** — `src/server/db/postgres/social/link-unfurls.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import type { LinkUnfurlDto } from "./link-unfurls";

// Pure shape/serialization test — does NOT touch the DB (the upsert/get
// functions are exercised by unfurl.test.ts via injected deps). This locks the
// DTO contract that the renderer and DB layer share.
describe("LinkUnfurlDto", () => {
  it("is a serializable record (no Date, no undefined)", () => {
    const dto: LinkUnfurlDto = {
      urlHash: "abc",
      url: "https://example.com/a",
      domain: "example.com",
      status: "OK",
      title: "Example",
      description: "desc",
      imageUrl: null,
      faviconUrl: "https://www.google.com/s2/favicons?domain=example.com&sz=64",
      provider: "GENERIC",
      youtubeId: null,
    };
    expect(JSON.stringify(dto)).toContain("example.com");
  });
});
```

Run (RED — module missing):
`DATABASE_URL='postgresql://dev:dev@localhost:5436/moviebrowser' yarn vitest run src/server/db/postgres/social/link-unfurls.test.ts`

**1b. Schema** — add to `prisma/schema.prisma` (place after `model Reaction { ... }`):

```prisma
/// Cached server-side link unfurls. Keyed by a sha256 of the normalized URL so
/// a card is fetched ONCE (on comment submit) and NEVER refetched on a render or
/// crawl path. No FK to comments — many comments may share one URL hash, and the
/// cache outlives any single comment. Carries no viewer data → safe in ISR HTML.
model LinkUnfurl {
  urlHash     String        @id @map("url_hash") // sha256 hex of normalized URL
  url         String        @db.Text
  domain      String
  status      UnfurlStatus  @default(OK)
  provider    UnfurlProvider @default(GENERIC)
  title       String?       @db.Text
  description String?       @db.Text
  imageUrl    String?       @map("image_url") @db.Text // stored; only rendered for allowlisted hosts (rung 7 follow-up)
  faviconUrl  String?       @map("favicon_url") @db.Text
  youtubeId   String?       @map("youtube_id") // set when provider = YOUTUBE
  fetchedAt   DateTime      @default(now()) @map("fetched_at")

  @@index([domain])
  @@map("link_unfurls")
}

enum UnfurlStatus {
  OK
  FAILED // SSRF-blocked / timeout / parse-fail: render as a plain safe anchor
}

enum UnfurlProvider {
  GENERIC
  YOUTUBE
}
```

Apply + restart:
```bash
DATABASE_URL='postgresql://dev:dev@localhost:5436/moviebrowser' yarn db:push
npx pm2 restart mb-dev
```

**1c. DB layer** — `src/server/db/postgres/social/link-unfurls.ts`:

```ts
import { UnfurlProvider, UnfurlStatus } from "@prisma/client";
import { prisma } from "@/server/db/postgres";

/** Serializable unfurl record shared by the DB layer, the unfurl service, and the renderer. */
export interface LinkUnfurlDto {
  urlHash: string;
  url: string;
  domain: string;
  status: "OK" | "FAILED";
  title: string | null;
  description: string | null;
  imageUrl: string | null;
  faviconUrl: string | null;
  provider: "GENERIC" | "YOUTUBE";
  youtubeId: string | null;
}

export interface UpsertUnfurlInput {
  urlHash: string;
  url: string;
  domain: string;
  status: "OK" | "FAILED";
  title: string | null;
  description: string | null;
  imageUrl: string | null;
  faviconUrl: string | null;
  provider: "GENERIC" | "YOUTUBE";
  youtubeId: string | null;
}

function toDto(row: {
  urlHash: string;
  url: string;
  domain: string;
  status: UnfurlStatus;
  title: string | null;
  description: string | null;
  imageUrl: string | null;
  faviconUrl: string | null;
  provider: UnfurlProvider;
  youtubeId: string | null;
}): LinkUnfurlDto {
  return {
    urlHash: row.urlHash,
    url: row.url,
    domain: row.domain,
    status: row.status === UnfurlStatus.OK ? "OK" : "FAILED",
    title: row.title,
    description: row.description,
    imageUrl: row.imageUrl,
    faviconUrl: row.faviconUrl,
    provider: row.provider === UnfurlProvider.YOUTUBE ? "YOUTUBE" : "GENERIC",
    youtubeId: row.youtubeId,
  };
}

const SELECT = {
  urlHash: true,
  url: true,
  domain: true,
  status: true,
  title: true,
  description: true,
  imageUrl: true,
  faviconUrl: true,
  provider: true,
  youtubeId: true,
} as const;

export async function getUnfurl(urlHash: string): Promise<LinkUnfurlDto | null> {
  const row = await prisma.linkUnfurl.findUnique({ where: { urlHash }, select: SELECT });
  return row ? toDto(row) : null;
}

/** Batch lookup for the render path (one query for a page of comments). */
export async function getUnfurlsByHashes(urlHashes: string[]): Promise<Map<string, LinkUnfurlDto>> {
  if (urlHashes.length === 0) return new Map();
  const rows = await prisma.linkUnfurl.findMany({
    where: { urlHash: { in: urlHashes } },
    select: SELECT,
  });
  return new Map(rows.map((r) => [r.urlHash, toDto(r)]));
}

export async function upsertUnfurl(input: UpsertUnfurlInput): Promise<void> {
  const data = {
    url: input.url,
    domain: input.domain,
    status: input.status === "OK" ? UnfurlStatus.OK : UnfurlStatus.FAILED,
    title: input.title,
    description: input.description,
    imageUrl: input.imageUrl,
    faviconUrl: input.faviconUrl,
    provider: input.provider === "YOUTUBE" ? UnfurlProvider.YOUTUBE : UnfurlProvider.GENERIC,
    youtubeId: input.youtubeId,
    fetchedAt: new Date(),
  };
  await prisma.linkUnfurl.upsert({
    where: { urlHash: input.urlHash },
    create: { urlHash: input.urlHash, ...data },
    update: data,
  });
}
```

Run (GREEN): same vitest path → passes. Then `yarn typecheck`.

**Commit:** `feat(discussion): link_unfurls cache table + DB layer`

---

### Task 2 — URL normalization, hashing, link extraction, YouTube id

**2a. Failing test** — `src/server/services/discussion/url-normalize.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { normalizeUrl, urlHash, extractFirstLink, parseYouTubeId } from "./url-normalize";

describe("normalizeUrl", () => {
  it("lowercases host, drops default port + fragment, keeps path/query", () => {
    expect(normalizeUrl("HTTPS://Example.COM:443/Path?b=2&a=1#frag")).toBe(
      "https://example.com/Path?b=2&a=1"
    );
  });
  it("returns null for non-http(s) schemes", () => {
    expect(normalizeUrl("javascript:alert(1)")).toBeNull();
    expect(normalizeUrl("ftp://example.com/x")).toBeNull();
    expect(normalizeUrl("data:text/html,hi")).toBeNull();
  });
  it("returns null for garbage", () => {
    expect(normalizeUrl("not a url")).toBeNull();
  });
});

describe("urlHash", () => {
  it("is a stable 64-char sha256 hex of the input string", () => {
    const h = urlHash("https://example.com/x");
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(urlHash("https://example.com/x")).toBe(h);
    expect(urlHash("https://example.com/y")).not.toBe(h);
  });
});

describe("extractFirstLink", () => {
  it("returns the first normalized http(s) URL in a body", () => {
    expect(extractFirstLink("look at https://a.com/p and http://b.com")).toBe("https://a.com/p");
  });
  it("returns null when there is no link", () => {
    expect(extractFirstLink("no links here")).toBeNull();
  });
  it("ignores non-http schemes", () => {
    expect(extractFirstLink("ping me at mailto:x@y.com")).toBeNull();
  });
});

describe("parseYouTubeId", () => {
  it("extracts the 11-char id from watch + short + embed URLs", () => {
    expect(parseYouTubeId("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
    expect(parseYouTubeId("https://youtu.be/dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
    expect(parseYouTubeId("https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
  });
  it("returns null for non-YouTube URLs", () => {
    expect(parseYouTubeId("https://example.com/watch?v=dQw4w9WgXcQ")).toBeNull();
  });
});
```

Run (RED).

**2b. Implementation** — `src/server/services/discussion/url-normalize.ts`:

```ts
import { createHash } from "node:crypto";

const ALLOWED_SCHEMES = new Set(["http:", "https:"]);

/**
 * Normalize a URL for stable hashing: enforce http(s), lowercase host, drop the
 * default port and the fragment, sort nothing else (path/query preserved). Returns
 * null for non-http(s) schemes or unparseable input.
 */
export function normalizeUrl(raw: string): string | null {
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    return null;
  }
  if (!ALLOWED_SCHEMES.has(u.protocol)) return null;
  u.hostname = u.hostname.toLowerCase();
  u.hash = "";
  if (
    (u.protocol === "http:" && u.port === "80") ||
    (u.protocol === "https:" && u.port === "443")
  ) {
    u.port = "";
  }
  // toString() re-appends a trailing "/" only when there is no path; leave as-is.
  return u.toString();
}

/** Stable sha256 hex of an arbitrary string (the normalized URL). */
export function urlHash(normalized: string): string {
  return createHash("sha256").update(normalized).digest("hex");
}

// Matches bare http(s) URLs in a comment body. Trailing punctuation handled by URL().
const URL_RE = /https?:\/\/[^\s<>"')\]]+/gi;

/** First normalized http(s) URL in a body, or null. */
export function extractFirstLink(body: string): string | null {
  const matches = body.match(URL_RE);
  if (!matches) return null;
  for (const candidate of matches) {
    const normalized = normalizeUrl(candidate);
    if (normalized) return normalized;
  }
  return null;
}

const YT_HOSTS = new Set([
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "youtu.be",
  "youtube-nocookie.com",
  "www.youtube-nocookie.com",
]);
const YT_ID_RE = /^[A-Za-z0-9_-]{11}$/;

/** Extract a YouTube video id (watch?v= / youtu.be/ / /embed/), else null. */
export function parseYouTubeId(rawUrl: string): string | null {
  let u: URL;
  try {
    u = new URL(rawUrl);
  } catch {
    return null;
  }
  if (!YT_HOSTS.has(u.hostname.toLowerCase())) return null;
  if (u.hostname.toLowerCase() === "youtu.be") {
    const id = u.pathname.slice(1);
    return YT_ID_RE.test(id) ? id : null;
  }
  const v = u.searchParams.get("v");
  if (v && YT_ID_RE.test(v)) return v;
  const embedMatch = /^\/embed\/([A-Za-z0-9_-]{11})/.exec(u.pathname);
  return embedMatch ? embedMatch[1] : null;
}
```

Run (GREEN). `yarn typecheck`.

**Commit:** `feat(discussion): URL normalize/hash + link + youtube-id extraction`

---

### Task 3 — SSRF guard (THE security test: rejects private/link-local, fails open)

**3a. Failing test** — `src/server/services/discussion/ssrf-guard.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { isPublicIp, assertPublicAddresses, type DnsLookup } from "./ssrf-guard";

describe("isPublicIp", () => {
  it("rejects IPv4 loopback / RFC1918 / link-local / CGNAT", () => {
    for (const ip of [
      "127.0.0.1",
      "127.5.5.5",
      "10.0.0.1",
      "172.16.0.1",
      "172.31.255.255",
      "192.168.1.1",
      "169.254.169.254", // cloud metadata endpoint — the classic SSRF target
      "100.64.0.1", // CGNAT
      "0.0.0.0",
    ]) {
      expect(isPublicIp(ip), ip).toBe(false);
    }
  });
  it("rejects IPv6 loopback / link-local / ULA / v4-mapped private", () => {
    for (const ip of ["::1", "fe80::1", "fc00::1", "fd00::1", "::ffff:127.0.0.1", "::ffff:10.0.0.1"]) {
      expect(isPublicIp(ip), ip).toBe(false);
    }
  });
  it("accepts real public IPs", () => {
    expect(isPublicIp("8.8.8.8")).toBe(true);
    expect(isPublicIp("1.1.1.1")).toBe(true);
    expect(isPublicIp("2606:4700:4700::1111")).toBe(true);
  });
  it("rejects non-IP garbage", () => {
    expect(isPublicIp("not-an-ip")).toBe(false);
    expect(isPublicIp("")).toBe(false);
  });
});

describe("assertPublicAddresses (DNS-resolved hostname → all IPs must be public)", () => {
  const publicLookup: DnsLookup = async () => [{ address: "8.8.8.8", family: 4 }];
  const privateLookup: DnsLookup = async () => [{ address: "169.254.169.254", family: 4 }];
  const mixedLookup: DnsLookup = async () => [
    { address: "8.8.8.8", family: 4 },
    { address: "10.0.0.1", family: 4 }, // DNS-rebinding: one public, one private
  ];
  const throwingLookup: DnsLookup = async () => {
    throw new Error("ENOTFOUND");
  };

  it("passes when every resolved address is public", async () => {
    await expect(assertPublicAddresses("good.example.com", publicLookup)).resolves.toBe(true);
  });
  it("FAILS CLOSED (returns false) when any resolved address is private/link-local", async () => {
    await expect(assertPublicAddresses("evil.example.com", privateLookup)).resolves.toBe(false);
    await expect(assertPublicAddresses("rebind.example.com", mixedLookup)).resolves.toBe(false);
  });
  it("FAILS OPEN-AS-BLOCK (returns false, never throws) when DNS errors", async () => {
    await expect(assertPublicAddresses("nx.example.com", throwingLookup)).resolves.toBe(false);
  });
});
```

Run (RED).

**3b. Implementation** — `src/server/services/discussion/ssrf-guard.ts`:

```ts
import { lookup as dnsLookup } from "node:dns/promises";
import { isIP } from "node:net";

/** Injectable DNS resolver (real one is dns/promises.lookup with {all:true}). */
export type DnsLookup = (hostname: string) => Promise<Array<{ address: string; family: number }>>;

const defaultLookup: DnsLookup = (hostname) => dnsLookup(hostname, { all: true });

function ipv4ToParts(ip: string): number[] | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  const nums = parts.map((p) => Number(p));
  if (nums.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return null;
  return nums;
}

function isPrivateIpv4(ip: string): boolean {
  const p = ipv4ToParts(ip);
  if (!p) return true; // unparseable → treat as unsafe
  const [a, b] = p;
  if (a === 0) return true; // "this" network
  if (a === 10) return true; // RFC1918
  if (a === 127) return true; // loopback
  if (a === 169 && b === 254) return true; // link-local (incl. 169.254.169.254 metadata)
  if (a === 172 && b >= 16 && b <= 31) return true; // RFC1918
  if (a === 192 && b === 168) return true; // RFC1918
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT 100.64.0.0/10
  if (a === 192 && b === 0) return true; // 192.0.0.0/24 (IETF) + 192.0.2.0/24 (TEST-NET)
  if (a >= 224) return true; // multicast + reserved (224-255)
  return false;
}

function isPrivateIpv6(ip: string): boolean {
  const lower = ip.toLowerCase();
  if (lower === "::1" || lower === "::") return true; // loopback / unspecified
  // v4-mapped (::ffff:a.b.c.d): defer to the v4 check.
  const mapped = /^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/.exec(lower);
  if (mapped) return isPrivateIpv4(mapped[1]);
  if (lower.startsWith("fe80")) return true; // link-local
  if (lower.startsWith("fc") || lower.startsWith("fd")) return true; // unique-local fc00::/7
  return false;
}

/** True only for a routable public IP literal. Unparseable / private → false. */
export function isPublicIp(ip: string): boolean {
  const fam = isIP(ip);
  if (fam === 4) return !isPrivateIpv4(ip);
  if (fam === 6) return !isPrivateIpv6(ip);
  return false; // not an IP at all
}

/**
 * Resolve a hostname and require EVERY returned address to be public. Fails CLOSED:
 * any private/link-local address, an empty result, OR a DNS error returns false
 * (block). Never throws — the caller is on a fail-open render-adjacent path.
 */
export async function assertPublicAddresses(
  hostname: string,
  lookup: DnsLookup = defaultLookup
): Promise<boolean> {
  try {
    const addresses = await lookup(hostname);
    if (addresses.length === 0) return false;
    return addresses.every((a) => isPublicIp(a.address));
  } catch {
    return false;
  }
}
```

Run (GREEN). `yarn typecheck`.

**Commit:** `feat(discussion): SSRF guard — reject private/link-local IPs, fail closed`

---

### Task 4 — OG/oEmbed parse (pure, cheerio)

**4a. Failing test** — `src/server/services/discussion/og-parse.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { parseOgMeta } from "./og-parse";

describe("parseOgMeta", () => {
  it("reads og:title / og:description / og:image", () => {
    const html = `<html><head>
      <meta property="og:title" content="Hello World" />
      <meta property="og:description" content="A great page" />
      <meta property="og:image" content="https://cdn.example.com/x.jpg" />
    </head><body></body></html>`;
    expect(parseOgMeta(html)).toEqual({
      title: "Hello World",
      description: "A great page",
      imageUrl: "https://cdn.example.com/x.jpg",
    });
  });
  it("falls back to <title> and meta[name=description]", () => {
    const html = `<html><head>
      <title>Fallback Title</title>
      <meta name="description" content="meta desc" />
    </head></html>`;
    expect(parseOgMeta(html)).toEqual({
      title: "Fallback Title",
      description: "meta desc",
      imageUrl: null,
    });
  });
  it("prefers twitter:image when og:image absent", () => {
    const html = `<head><meta name="twitter:image" content="https://t.example/y.png" /></head>`;
    expect(parseOgMeta(html).imageUrl).toBe("https://t.example/y.png");
  });
  it("returns all-null on empty/garbage", () => {
    expect(parseOgMeta("")).toEqual({ title: null, description: null, imageUrl: null });
    expect(parseOgMeta("<html></html>")).toEqual({ title: null, description: null, imageUrl: null });
  });
  it("trims whitespace and caps overly long fields", () => {
    const long = "x".repeat(5000);
    const html = `<head><meta property="og:title" content="  ${long}  " /></head>`;
    const meta = parseOgMeta(html);
    expect(meta.title?.length).toBe(2000);
  });
});
```

Run (RED).

**4b. Implementation** — `src/server/services/discussion/og-parse.ts`:

```ts
import * as cheerio from "cheerio";

export interface UnfurlMeta {
  title: string | null;
  description: string | null;
  imageUrl: string | null;
}

const MAX_TITLE = 2000;
const MAX_DESC = 2000;

function clamp(value: string | undefined, max: number): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.length > max ? trimmed.slice(0, max) : trimmed;
}

/**
 * Pure HTML → metadata. Reads OG tags, falling back to twitter:* and the bare
 * <title>/meta[name=description]. Never executes scripts, never resolves URLs
 * (the image URL is stored verbatim; the renderer decides whether to show it).
 */
export function parseOgMeta(html: string): UnfurlMeta {
  const $ = cheerio.load(html);
  const meta = (selectors: string[]): string | undefined => {
    for (const sel of selectors) {
      const content = $(sel).attr("content");
      if (content && content.trim()) return content;
    }
    return undefined;
  };

  const title =
    clamp(meta(['meta[property="og:title"]', 'meta[name="twitter:title"]']), MAX_TITLE) ??
    clamp($("title").first().text() || undefined, MAX_TITLE);
  const description = clamp(
    meta([
      'meta[property="og:description"]',
      'meta[name="twitter:description"]',
      'meta[name="description"]',
    ]),
    MAX_DESC
  );
  const imageUrl = clamp(
    meta(['meta[property="og:image"]', 'meta[name="twitter:image"]', 'meta[name="twitter:image:src"]']),
    2048
  );

  return { title, description, imageUrl };
}
```

Run (GREEN). `yarn typecheck`.

**Commit:** `feat(discussion): OG/oEmbed metadata parser (cheerio, pure)`

---

### Task 5 — `fetchUnfurl` (SSRF-hardened) + `enqueueUnfurl` + cache

**5a. Failing test** — `src/server/services/discussion/unfurl.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";
import { fetchUnfurl, type UnfurlDeps } from "./unfurl";
import type { UpsertUnfurlInput } from "@/server/db/postgres/social/link-unfurls";

function htmlResponse(body: string, url: string): Response {
  return new Response(body, {
    status: 200,
    headers: { "content-type": "text/html; charset=utf-8" },
    // Response.url is read-only; the fetcher passes the final URL separately, so
    // we don't rely on it here.
  }) as unknown as Response;
}

const okMeta = `<head>
  <meta property="og:title" content="Example Title" />
  <meta property="og:description" content="Example desc" />
</head>`;

describe("fetchUnfurl", () => {
  it("returns an OK GENERIC card for a public http(s) URL", async () => {
    const deps: UnfurlDeps = {
      assertPublic: async () => true,
      fetchText: async () => ({ ok: true, finalUrl: "https://example.com/a", html: okMeta }),
    };
    const result = await fetchUnfurl("https://example.com/a", deps);
    expect(result.status).toBe("OK");
    expect(result.provider).toBe("GENERIC");
    expect(result.title).toBe("Example Title");
    expect(result.domain).toBe("example.com");
    expect(result.faviconUrl).toContain("example.com");
    expect(result.imageUrl).toBeNull(); // no og:image → null
  });

  it("classifies a YouTube URL as provider YOUTUBE with the id (no HTML fetch needed)", async () => {
    const fetchText = vi.fn();
    const deps: UnfurlDeps = { assertPublic: async () => true, fetchText };
    const result = await fetchUnfurl("https://youtu.be/dQw4w9WgXcQ", deps);
    expect(result.status).toBe("OK");
    expect(result.provider).toBe("YOUTUBE");
    expect(result.youtubeId).toBe("dQw4w9WgXcQ");
    expect(fetchText).not.toHaveBeenCalled(); // youtube is rendered by the facade, no scrape
  });

  it("FAILS (status FAILED) when the SSRF guard blocks the host — and never fetches", async () => {
    const fetchText = vi.fn();
    const deps: UnfurlDeps = { assertPublic: async () => false, fetchText };
    const result = await fetchUnfurl("https://169.254.169.254/latest/meta-data", deps);
    expect(result.status).toBe("FAILED");
    expect(fetchText).not.toHaveBeenCalled();
  });

  it("FAILS for a non-http(s) scheme without resolving DNS", async () => {
    const assertPublic = vi.fn();
    const deps: UnfurlDeps = { assertPublic, fetchText: async () => ({ ok: false }) };
    const result = await fetchUnfurl("javascript:alert(1)", deps);
    expect(result.status).toBe("FAILED");
    expect(assertPublic).not.toHaveBeenCalled();
  });

  it("FAILS OPEN (status FAILED, no throw) when the fetch errors/timeouts", async () => {
    const deps: UnfurlDeps = {
      assertPublic: async () => true,
      fetchText: async () => ({ ok: false }),
    };
    const result = await fetchUnfurl("https://example.com/timeout", deps);
    expect(result.status).toBe("FAILED");
    expect(result.url).toBe("https://example.com/timeout");
    expect(result.domain).toBe("example.com");
  });
});
```

(`htmlResponse` is unused scaffolding kept minimal — the deps inject `fetchText`
directly, so no real `fetch`/`Response` is exercised in the unit test. Remove the
helper if your linter flags it; it is intentionally not referenced.)

> NOTE for the implementing agent: delete the unused `htmlResponse` helper before
> committing if `yarn lint`/typecheck complains about it — it is illustrative only.

Run (RED).

**5b. Implementation** — `src/server/services/discussion/unfurl.ts`:

```ts
import { dataLogger } from "@/lib/logger";
import {
  getUnfurl,
  upsertUnfurl,
  type LinkUnfurlDto,
  type UpsertUnfurlInput,
} from "@/server/db/postgres/social/link-unfurls";
import { parseOgMeta } from "./og-parse";
import { assertPublicAddresses } from "./ssrf-guard";
import { normalizeUrl, parseYouTubeId, urlHash } from "./url-normalize";

const FETCH_TIMEOUT_MS = 2_000; // mirrors media-resolver.ts discipline
const MAX_REDIRECTS = 3;
const MAX_BODY_BYTES = 512 * 1024; // 512KB of HTML is plenty for <head> meta
const USER_AGENT = "MovieBrowserUnfurl/1.0 (+https://themoviebrowser.com)";

/** Injectable side-effects so the SSRF path is unit-testable without real network. */
export interface UnfurlDeps {
  /** Resolve host → all IPs and require all public (ssrf-guard). */
  assertPublic: (hostname: string) => Promise<boolean>;
  /** Fetch a URL, following safe redirects, returning the final URL + HTML body. */
  fetchText: (
    url: string
  ) => Promise<{ ok: true; finalUrl: string; html: string } | { ok: false }>;
}

function faviconFor(domain: string): string {
  // Single known-safe host (Google s2). NOT an arbitrary-domain hotlink.
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=64`;
}

function failedResult(normalized: string, urlHashValue: string): UpsertUnfurlInput {
  let domain = "";
  try {
    domain = new URL(normalized).hostname;
  } catch {
    domain = "";
  }
  return {
    urlHash: urlHashValue,
    url: normalized,
    domain,
    status: "FAILED",
    title: null,
    description: null,
    imageUrl: null,
    faviconUrl: null,
    provider: "GENERIC",
    youtubeId: null,
  };
}

/**
 * Build the unfurl record for a URL. SSRF-hardened, fail-open: any
 * scheme/SSRF/fetch/parse failure yields a FAILED record (the renderer shows a
 * plain safe anchor). Never throws.
 */
export async function fetchUnfurl(rawUrl: string, deps: UnfurlDeps): Promise<UpsertUnfurlInput> {
  const normalized = normalizeUrl(rawUrl);
  if (!normalized) {
    // Non-http(s) / garbage: hash the raw input so the failure is still cached.
    return failedResult(rawUrl, urlHash(rawUrl));
  }
  const hash = urlHash(normalized);

  // YouTube → no scrape; the facade renders from the id. Treat as OK immediately.
  const youtubeId = parseYouTubeId(normalized);
  if (youtubeId) {
    return {
      urlHash: hash,
      url: normalized,
      domain: new URL(normalized).hostname,
      status: "OK",
      title: null,
      description: null,
      imageUrl: null,
      faviconUrl: faviconFor(new URL(normalized).hostname),
      provider: "YOUTUBE",
      youtubeId,
    };
  }

  let hostname: string;
  try {
    hostname = new URL(normalized).hostname;
  } catch {
    return failedResult(normalized, hash);
  }

  // SSRF gate BEFORE any network egress.
  const safe = await deps.assertPublic(hostname);
  if (!safe) return failedResult(normalized, hash);

  const fetched = await deps.fetchText(normalized);
  if (!fetched.ok) return failedResult(normalized, hash);

  const meta = parseOgMeta(fetched.html);
  const finalDomain = (() => {
    try {
      return new URL(fetched.finalUrl).hostname;
    } catch {
      return hostname;
    }
  })();

  return {
    urlHash: hash,
    url: normalized,
    domain: finalDomain,
    status: "OK",
    title: meta.title,
    description: meta.description,
    // Stored for forward-compat (rung 7 image proxy) but only RENDERED for
    // allowlisted hosts — see link-card.tsx.
    imageUrl: meta.imageUrl,
    faviconUrl: faviconFor(finalDomain),
    provider: "GENERIC",
    youtubeId: null,
  };
}

/**
 * Real network fetch with the SSRF discipline applied AT EACH redirect hop:
 * manual redirects, 2s budget across the whole chain, re-resolve+re-gate each
 * Location, body-size cap. Used by the default deps in enqueueUnfurl.
 */
async function fetchTextHardened(
  startUrl: string
): Promise<{ ok: true; finalUrl: string; html: string } | { ok: false }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    let current = startUrl;
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      const hostname = new URL(current).hostname;
      if (!(await assertPublicAddresses(hostname))) return { ok: false };
      const res = await fetch(current, {
        signal: controller.signal,
        redirect: "manual",
        headers: { "user-agent": USER_AGENT, accept: "text/html,application/xhtml+xml" },
      });
      if (res.status >= 300 && res.status < 400) {
        const location = res.headers.get("location");
        if (!location) return { ok: false };
        const next = normalizeUrl(new URL(location, current).toString());
        if (!next) return { ok: false };
        current = next;
        continue;
      }
      if (!res.ok) return { ok: false };
      const contentType = res.headers.get("content-type") ?? "";
      if (!contentType.includes("html")) return { ok: false };
      // Cap the body: read up to MAX_BODY_BYTES then stop.
      const buf = await res.arrayBuffer();
      const slice = buf.byteLength > MAX_BODY_BYTES ? buf.slice(0, MAX_BODY_BYTES) : buf;
      const html = new TextDecoder("utf-8").decode(slice);
      return { ok: true, finalUrl: current, html };
    }
    return { ok: false }; // too many redirects
  } catch {
    return { ok: false };
  } finally {
    clearTimeout(timer);
  }
}

const defaultDeps: UnfurlDeps = {
  assertPublic: (hostname) => assertPublicAddresses(hostname),
  fetchText: fetchTextHardened,
};

/** Cache read for the render path (delegates to the DB layer). */
export async function getCachedUnfurl(normalized: string): Promise<LinkUnfurlDto | null> {
  return getUnfurl(urlHash(normalized));
}

/**
 * Fire-and-forget unfurl on comment submit. Idempotent: skips the fetch if the URL
 * is already cached. Swallows all errors (fail-open) — an unfurl miss only means a
 * comment renders its link as a plain anchor.
 */
export async function enqueueUnfurl(rawUrl: string, deps: UnfurlDeps = defaultDeps): Promise<void> {
  try {
    const normalized = normalizeUrl(rawUrl);
    if (!normalized) return;
    const existing = await getUnfurl(urlHash(normalized));
    if (existing) return; // already cached — never refetch
    const record = await fetchUnfurl(normalized, deps);
    await upsertUnfurl(record);
  } catch (error: unknown) {
    dataLogger.error(
      { action: "enqueueUnfurl", error: error instanceof Error ? error.message : String(error) },
      "enqueueUnfurl failed"
    );
  }
}
```

Run (GREEN). `yarn typecheck`.

**Commit:** `feat(discussion): SSRF-hardened unfurl fetch + cache + enqueue`

---

### Task 6 — Wire `enqueueUnfurl` into `createComment` (fire-and-forget, post-publish)

**6a. Failing test** — extend `src/server/actions/comments.ts` is a `"use server"`
module that's awkward to unit-test directly; instead lock the wiring with a focused
test on a small extracted helper. Add `src/server/services/discussion/unfurl-enqueue.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";
import { unfurlFirstLink } from "./unfurl";

// unfurlFirstLink: given a published comment body, enqueue the first link (if any).
describe("unfurlFirstLink", () => {
  it("enqueues the first link in a body", async () => {
    const enqueue = vi.fn(async () => {});
    await unfurlFirstLink("check https://example.com/a out", enqueue);
    expect(enqueue).toHaveBeenCalledWith("https://example.com/a");
  });
  it("does nothing when there is no link", async () => {
    const enqueue = vi.fn(async () => {});
    await unfurlFirstLink("no links", enqueue);
    expect(enqueue).not.toHaveBeenCalled();
  });
});
```

Run (RED — `unfurlFirstLink` missing).

**6b. Implementation** — append to `src/server/services/discussion/unfurl.ts`:

```ts
import { extractFirstLink } from "./url-normalize";

/**
 * Enqueue an unfurl for the first link in a published comment body. Bounded by
 * comment volume (one link per submit). Caller fires it fire-and-forget AFTER
 * the comment is PUBLISHED — never on a render path.
 */
export async function unfurlFirstLink(
  body: string,
  enqueue: (url: string) => Promise<void> = enqueueUnfurl
): Promise<void> {
  const link = extractFirstLink(body);
  if (!link) return;
  await enqueue(link);
}
```

(`extractFirstLink` import can be merged into the existing url-normalize import line.)

**6c. Wire into `createComment`** — `src/server/actions/comments.ts`. Inside the
existing post-publish `void (async () => { ... })()` block (after the notifications,
before its `catch`), add the unfurl call. Add the import at the top:

```ts
import { unfurlFirstLink } from "@/server/services/discussion/unfurl";
```

Then in the fire-and-forget block in `createComment`, after the mention loop:

```ts
        // Unfurl the first link (fire-and-forget; bounded by comment volume).
        // Runs only on submit of a PUBLISHED comment — never on a render path.
        await unfurlFirstLink(input.body);
```

(Held / PENDING_REVIEW comments return early before this block, so no unfurl fires
for unpublished content — correct: we only spend the fetch on visible comments.)

Run the helper test (GREEN). `yarn typecheck`.

**Commit:** `feat(discussion): unfurl first link on comment publish (fire-and-forget)`

---

### Task 7 — Hydrate cached unfurl rows into the comment DTO

**7a. Failing test** — `src/server/db/postgres/comments-unfurl.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { attachLinkCards, type LinkCardLite } from "./comments";
import type { CommentDto } from "./comments";

function dto(id: number, body: string): CommentDto {
  return {
    id,
    parentId: null,
    body,
    spoilerScope: "NONE",
    scopeSeason: null,
    scopeEpisode: null,
    status: "PUBLISHED",
    likeCount: 0,
    createdAt: "2026-06-15T00:00:00.000Z",
    editedAt: null,
    author: null,
    linkCard: null,
  };
}

describe("attachLinkCards", () => {
  it("attaches a cached card to the comment whose first link matches", () => {
    const comments = [dto(1, "see https://example.com/a"), dto(2, "no link")];
    const cards = new Map<string, LinkCardLite>([
      [
        "https://example.com/a",
        {
          url: "https://example.com/a",
          domain: "example.com",
          status: "OK",
          provider: "GENERIC",
          title: "Ex",
          description: null,
          imageUrl: null,
          faviconUrl: "https://www.google.com/s2/favicons?domain=example.com&sz=64",
          youtubeId: null,
        },
      ],
    ]);
    const result = attachLinkCards(comments, cards);
    expect(result[0].linkCard?.title).toBe("Ex");
    expect(result[1].linkCard).toBeNull();
  });
  it("leaves linkCard null when no cached row exists (no refetch on render)", () => {
    const comments = [dto(1, "see https://uncached.com/a")];
    const result = attachLinkCards(comments, new Map());
    expect(result[0].linkCard).toBeNull();
  });
});
```

Run (RED).

**7b. Implementation** — edits to `src/server/db/postgres/comments.ts`.

Add a `linkCard` field to the DTO (a trimmed projection of `LinkUnfurlDto`, no
`urlHash`), default it `null` in `toCommentDto`, and add the pure `attachLinkCards`
joiner plus the keyset hook (`getUnfurlsByHashes`) for callers.

Add near the top imports:

```ts
import { getUnfurlsByHashes } from "./social/link-unfurls";
import { extractFirstLink, urlHash } from "@/server/services/discussion/url-normalize";
```

Add the lite type + extend `CommentDto`:

```ts
/** The card shape carried on a rendered comment (no urlHash — render-only). */
export interface LinkCardLite {
  url: string;
  domain: string;
  status: "OK" | "FAILED";
  provider: "GENERIC" | "YOUTUBE";
  title: string | null;
  description: string | null;
  imageUrl: string | null;
  faviconUrl: string | null;
  youtubeId: string | null;
}
```

In `interface CommentDto`, add the field:

```ts
  linkCard: LinkCardLite | null;
```

In `toCommentDto`, add to the returned object:

```ts
    linkCard: null, // hydrated separately via attachLinkCards (no per-row query)
```

Add the pure joiner (export it):

```ts
/**
 * Attach a cached link card to each comment whose FIRST link has a cached
 * unfurl. PURE — reads only the provided map (built once per page). NEVER fetches
 * on the render path (edge-cache + perf invariant). Comments without a cached row
 * keep `linkCard: null` and render a plain anchor.
 */
export function attachLinkCards<T extends CommentDto>(
  comments: T[],
  cardsByUrl: Map<string, LinkCardLite>
): T[] {
  return comments.map((c) => {
    if (c.status !== "PUBLISHED") return c;
    const link = extractFirstLink(c.body);
    if (!link) return c;
    const card = cardsByUrl.get(link);
    return card ? { ...c, linkCard: card } : c;
  });
}

/**
 * Build the URL→card map for a set of comment bodies (roots + replies). One
 * batched query against the unfurl cache; returns only OK rows (FAILED rows
 * render as plain anchors anyway).
 */
export async function buildLinkCardMap(bodies: string[]): Promise<Map<string, LinkCardLite>> {
  const urls = new Map<string, string>(); // normalized url → urlHash
  for (const body of bodies) {
    const link = extractFirstLink(body);
    if (link) urls.set(link, urlHash(link));
  }
  if (urls.size === 0) return new Map();
  const byHash = await getUnfurlsByHashes([...urls.values()]);
  const result = new Map<string, LinkCardLite>();
  for (const [url, hash] of urls) {
    const dto = byHash.get(hash);
    if (dto && dto.status === "OK") {
      result.set(url, {
        url: dto.url,
        domain: dto.domain,
        status: dto.status,
        provider: dto.provider,
        title: dto.title,
        description: dto.description,
        imageUrl: dto.imageUrl,
        faviconUrl: dto.faviconUrl,
        youtubeId: dto.youtubeId,
      });
    }
  }
  return result;
}
```

> Integration note for the implementing agent (NOT a separate task — fold into the
> existing public/gated read functions in `comments.ts`): wherever a page of comments
> is assembled (`getPublicCommentPage` and the gated `loadComments` path), after
> building the `CommentThreadDto[]`, gather all root + reply bodies, call
> `buildLinkCardMap(bodies)`, then run roots and replies through `attachLinkCards`.
> This stays a pure in-process join — zero extra per-comment queries, one batched
> unfurl lookup. Both the cacheable (public) and POST (gated) paths use the SAME
> cached table, so neither does network work at render.

Run (GREEN). `yarn typecheck`.

**Commit:** `feat(discussion): hydrate cached link cards into comment DTOs (no render fetch)`

---

### Task 8 — `LiteYouTube` facade (client island)

**8a. Failing test** — `src/components/features/discussion/lite-youtube.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { LiteYouTube } from "./lite-youtube";

describe("LiteYouTube", () => {
  it("renders a click-to-load facade (button/thumbnail), NOT a raw iframe, before interaction", () => {
    const { container } = render(<LiteYouTube id="dQw4w9WgXcQ" title="Trailer" />);
    // No iframe in the DOM until the user clicks (facade contract).
    expect(container.querySelector("iframe")).toBeNull();
    // The accessible play affordance is present.
    expect(screen.getByRole("button")).toBeTruthy();
  });
});
```

> The repo's vitest setup uses `happy-dom` + `@vitejs/plugin-react`. If
> `@testing-library/react` is not already a devDependency, add it:
> `yarn add -D @testing-library/react` (check `package.json` first — several
> `.test.tsx` component tests may already pull it in).

Run (RED).

**8b. Implementation** — `src/components/features/discussion/lite-youtube.tsx`:

```tsx
"use client";

import LiteYouTubeEmbed from "react-lite-youtube-embed";
import "react-lite-youtube-embed/dist/LiteYouTubeEmbed.css";

/**
 * Click-to-load YouTube facade. Renders ONLY a poster + play button until the
 * user clicks; the youtube-nocookie.com iframe is injected on click. NEVER a
 * raw user-controlled iframe (the id is validated upstream by parseYouTubeId).
 * CSP frame-src allows youtube-nocookie.com (see next.config.mjs).
 */
export function LiteYouTube({ id, title }: { id: string; title: string }) {
  return (
    <div className="overflow-hidden rounded-lg border border-border max-w-md">
      <LiteYouTubeEmbed
        id={id}
        title={title}
        noCookie
        poster="hqdefault"
        wrapperClass="yt-lite rounded-lg"
      />
    </div>
  );
}
```

Run (GREEN). `yarn typecheck`.

**Commit:** `feat(discussion): lite-YouTube click-to-load facade`

---

### Task 9 — `LinkCard` server component (card vs safe anchor)

**9a. Failing test** — `src/components/features/discussion/link-card.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { LinkCard } from "./link-card";
import type { LinkCardLite } from "@/server/db/postgres/comments";

const generic: LinkCardLite = {
  url: "https://example.com/article",
  domain: "example.com",
  status: "OK",
  provider: "GENERIC",
  title: "Great Article",
  description: "All about movies",
  imageUrl: "https://external.cdn/x.jpg", // arbitrary host — must NOT be hotlinked (rung 7 deferred)
  faviconUrl: "https://www.google.com/s2/favicons?domain=example.com&sz=64",
  youtubeId: null,
};

describe("LinkCard", () => {
  it("renders a generic card with title, domain, and a safe outbound link", () => {
    render(<LinkCard card={generic} />);
    expect(screen.getByText("Great Article")).toBeTruthy();
    expect(screen.getByText("example.com")).toBeTruthy();
    const anchor = screen.getByRole("link") as HTMLAnchorElement;
    expect(anchor.getAttribute("rel")).toBe("nofollow ugc noopener noreferrer");
    expect(anchor.getAttribute("target")).toBe("_blank");
    expect(anchor.getAttribute("href")).toBe("https://example.com/article");
  });

  it("does NOT hotlink an arbitrary external og:image (rung 7 deferred)", () => {
    const { container } = render(<LinkCard card={generic} />);
    const img = container.querySelector('img[src="https://external.cdn/x.jpg"]');
    expect(img).toBeNull();
  });

  it("renders the lite-YouTube facade for a YOUTUBE card (no raw iframe at rest)", () => {
    const yt: LinkCardLite = {
      ...generic,
      url: "https://youtu.be/dQw4w9WgXcQ",
      domain: "youtu.be",
      provider: "YOUTUBE",
      youtubeId: "dQw4w9WgXcQ",
      title: null,
      imageUrl: null,
    };
    const { container } = render(<LinkCard card={yt} />);
    expect(container.querySelector("iframe")).toBeNull(); // facade, not raw embed
  });
});
```

Run (RED).

**9b. Implementation** — `src/components/features/discussion/link-card.tsx`:

```tsx
import { ExternalLink } from "lucide-react";
import type { LinkCardLite } from "@/server/db/postgres/comments";
import { LiteYouTube } from "./lite-youtube";

/**
 * Renders a cached link as a rich preview card. Server component — reads ONLY the
 * cached card data (no network, no viewer state → safe in ISR HTML). All outbound
 * links carry rel="nofollow ugc noopener noreferrer" target="_blank".
 *
 * Image policy (spec §5, rung 7 image-proxy DEFERRED — option (a)): we do NOT
 * hotlink arbitrary external og:image URLs. Rich imagery is reserved for
 * allowlisted providers (YouTube via the facade thumbnail). Generic cards show
 * text + domain + favicon only. The og:image is stored for the future proxy.
 */
const REL = "nofollow ugc noopener noreferrer";

export function LinkCard({ card }: { card: LinkCardLite }) {
  if (card.status !== "OK") {
    return <SafeAnchor url={card.url} label={card.url} />;
  }

  if (card.provider === "YOUTUBE" && card.youtubeId) {
    return <LiteYouTube id={card.youtubeId} title={card.title ?? "YouTube video"} />;
  }

  return (
    <a
      href={card.url}
      target="_blank"
      rel={REL}
      className="mt-2 flex max-w-md items-stretch gap-3 rounded-lg border border-border bg-card p-3 transition-colors hover:bg-accent/50"
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          {/* Favicon host is a single known-safe endpoint (Google s2), not the
              arbitrary target domain. Kept as a plain <img> (small, decorative). */}
          {card.faviconUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={card.faviconUrl} alt="" width={16} height={16} className="rounded-sm" />
          )}
          <span className="truncate">{card.domain}</span>
        </div>
        {card.title && (
          <p className="mt-1 line-clamp-2 text-sm font-medium text-foreground">{card.title}</p>
        )}
        {card.description && (
          <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{card.description}</p>
        )}
      </div>
      <ExternalLink className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
    </a>
  );
}

function SafeAnchor({ url, label }: { url: string; label: string }) {
  return (
    <a
      href={url}
      target="_blank"
      rel={REL}
      className="break-all text-sm text-foreground underline underline-offset-2 hover:text-foreground/80"
    >
      {label}
    </a>
  );
}
```

> The `faviconUrl` host (`www.google.com`) must be in `next.config.mjs` `images`
> `remotePatterns` IF rendered via `next/image`; we use a plain `<img>` here (with
> the eslint-disable) precisely to avoid the optimizer + remotePattern coupling and
> to keep it a tiny decorative favicon. The CSP `img-src` (Task 10) must include
> `https://www.google.com`.

Run (GREEN). `yarn typecheck`.

**Commit:** `feat(discussion): LinkCard — preview card / safe anchor / youtube facade`

---

### Task 10 — Render the card in `comment-item.tsx`

No new test (pure composition; covered by Task 9). Edit
`src/components/features/discussion/comment-item.tsx`:

Add the import:

```ts
import { LinkCard } from "./link-card";
```

In `CommentBody`, render the card below the body for the PUBLISHED branch (and the
pending branch). Replace the final `return` of `CommentBody`:

```tsx
  return (
    <div>
      <p className="text-sm text-foreground/90 leading-relaxed">
        <MentionText body={comment.body} />
      </p>
      {comment.linkCard && <LinkCard card={comment.linkCard} />}
    </div>
  );
```

(`comment.linkCard` is now on `CommentDto` from Task 7; it is `null` unless a cached
unfurl row matched the comment's first link, so this renders nothing extra for the
overwhelming majority of comments.)

Run `yarn typecheck`.

**Commit:** `feat(discussion): render link cards inside comment items`

---

### Task 11 — CSP header (frame-src youtube-nocookie, img-src allowlist)

No unit test (header config). Verify by curl after `yarn dev`. Edit
`next.config.mjs` — add a `Content-Security-Policy` entry to the existing
`/:path*` headers block (alongside `X-Frame-Options` etc.):

```js
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              // Next inlines hydration bootstrap + uses eval in dev; allow both
              // unsafe-inline/eval for scripts (matches Next's documented CSP
              // guidance until nonce-based CSP is wired — a separate hardening
              // task). Keep this conservative: no wildcard.
              "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
              "style-src 'self' 'unsafe-inline'",
              // Images: our CDNs + TMDB + YouTube thumbnails + the favicon host.
              // NO arbitrary external hotlinks (rung 7 image proxy deferred).
              "img-src 'self' data: blob: https://image.tmdb.org https://image.themoviebrowser.com https://img.youtube.com https://i.ytimg.com https://www.google.com",
              "font-src 'self' data:",
              // YouTube facade iframe (lite-youtube → youtube-nocookie.com) only.
              "frame-src 'self' https://www.youtube-nocookie.com https://www.youtube.com",
              // XHR/fetch: self (server actions POST same-origin) + analytics ingest.
              "connect-src 'self' https://*.themoviebrowser.com",
              "media-src 'self' https://image.themoviebrowser.com",
              "object-src 'none'",
              "base-uri 'self'",
              "frame-ancestors 'self'",
              "form-action 'self'",
            ].join("; "),
          },
```

**Verification (do NOT skip — regressions here break every embed):**

```bash
# 1. existing trailer embeds still load (manual: /movie/<id> video gallery,
#    home trailer modal) — both already use youtube-nocookie.com / youtube.com/embed,
#    which the frame-src above permits.
# 2. header present:
curl -sI http://localhost:3000/ | grep -i content-security-policy
# 3. no console CSP violations on a movie page in a real browser (the proxy 429s
#    headless — open a real browser; see performance.md). Watch for
#    "Refused to frame" / "Refused to load the image" violations.
```

> CSP footgun callout (record in this plan, surface in the PR description): the
> existing `video-gallery.tsx` uses `youtube-nocookie.com/embed` and
> `trailer-modal.tsx` uses `youtube.com/embed` + `img.youtube.com` thumbnails — ALL
> covered by the `frame-src`/`img-src` above. The home page also pulls TMDB +
> our-CDN imagery — covered. If a violation appears for a host not listed, ADD that
> exact host (never widen to `*`). `script-src 'unsafe-eval'` is required by Next's
> dev runtime + Turbopack; tightening to a nonce-based policy is a separate hardening
> task, out of this phase's scope.

**Commit:** `feat(security): introduce CSP — youtube-nocookie frame-src + image allowlist`

---

## Final verification (before declaring Phase C done)

Per `superpowers:verification-before-completion` — run and confirm output, do not
assert from memory:

```bash
# full unit suite for the new + touched files
DATABASE_URL='postgresql://dev:dev@localhost:5436/moviebrowser' yarn vitest run \
  src/server/services/discussion/ssrf-guard.test.ts \
  src/server/services/discussion/url-normalize.test.ts \
  src/server/services/discussion/og-parse.test.ts \
  src/server/services/discussion/unfurl.test.ts \
  src/server/services/discussion/unfurl-enqueue.test.ts \
  src/server/db/postgres/social/link-unfurls.test.ts \
  src/server/db/postgres/comments-unfurl.test.ts \
  src/components/features/discussion/lite-youtube.test.tsx \
  src/components/features/discussion/link-card.test.tsx

yarn typecheck
yarn lint

# manual: paste a YouTube link + a generic article link into a comment in the
# local dev app (test-auth session), reload, confirm: youtube facade renders
# (click → nocookie iframe), generic link → text+domain+favicon card, an
# un-unfurled link → plain safe anchor. Confirm NO network fetch on reload
# (the card comes from the cached table). Check `link_unfurls` rows via db:studio.
```

SSRF acceptance (the security gate this phase exists to satisfy): `ssrf-guard.test.ts`
proves `169.254.169.254`, RFC1918, loopback, link-local, CGNAT, ULA, and v4-mapped
private addresses are all rejected, mixed-result DNS (rebinding) is rejected, and a
DNS error fails closed — while `unfurl.test.ts` proves a blocked host never triggers a
fetch and any fetch error fails open to a plain anchor.

---

## Notes / deferred (call these out in the PR description)

- **Rung 7 (image proxy / external image hotlinks) DEFERRED** (spec §5). v1 generic
  cards show text + domain + favicon only; the og:image is stored but not rendered.
  Wiring a proxy + the matching `img-src` is a future phase.
- **CloudFront single-path invalidation on moderation removal** of a comment carrying
  a card is the SAME open follow-up as the rest of discussions (parent spec §13 / the
  social-features pre-deploy checklist item 4) — not wired here.
- **No AI, no fan-out, no upload** introduced. No catalog tables touched. Natural-key
  episode invariant untouched (`link_unfurls` has no episode/catalog FK).
- **Nonce-based CSP** (replacing `'unsafe-inline'`/`'unsafe-eval'`) is a separate
  hardening task, not Phase C.
```