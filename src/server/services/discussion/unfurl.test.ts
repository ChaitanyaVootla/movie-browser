import { describe, it, expect, vi } from "vitest";
import { fetchUnfurl, type UnfurlDeps } from "./unfurl";
import type { UpsertUnfurlInput } from "@/server/db/postgres/social/link-unfurls";

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
