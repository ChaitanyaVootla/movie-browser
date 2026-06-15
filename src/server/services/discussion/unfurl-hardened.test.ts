import { describe, it, expect, vi } from "vitest";
import { fetchTextHardened } from "./unfurl";

/**
 * Exercises the hardened fetch chain with an injected fetch (no real network)
 * and no dispatcher (the IP-pin dispatcher is null in tests — the mock fetch
 * doesn't dial). Covers: the body-size cap (I4) and the redirect re-gate (I3 —
 * the M3 path that was previously untested). The genuine DNS-rebinding pin is
 * the undici `connect.lookup` in makePinnedDispatcher (production path); the
 * residual same-hostname rebinding risk between the per-hop `assertPublicAddresses`
 * check and the dial is closed by that dispatcher, not exercised here.
 */

function htmlResponse(body: string, init?: { status?: number; headers?: Record<string, string> }): Response {
  return new Response(body, {
    status: init?.status ?? 200,
    headers: { "content-type": "text/html", ...(init?.headers ?? {}) },
  });
}

/** A host gate that mirrors the real one but without real DNS: literal private
 *  IPs are blocked, everything else passes (so mock hostnames are "public"). */
const fakeGate = async (hostname: string): Promise<boolean> => hostname !== "169.254.169.254";

describe("fetchTextHardened", () => {
  it("caps the body at MAX_BODY_BYTES (streams, does not buffer the whole body)", async () => {
    const big = "x".repeat(2 * 1024 * 1024); // 2MB > 512KB cap
    const fetchImpl = vi.fn(async () => htmlResponse(`<head>${big}</head>`));
    const result = await fetchTextHardened("https://example.com/big", {
      fetchImpl,
      assertPublic: fakeGate,
      dispatcher: null,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.html.length).toBeLessThanOrEqual(512 * 1024);
      expect(result.html.length).toBeGreaterThan(0);
    }
  });

  it("returns the body for a normal small HTML response", async () => {
    const fetchImpl = vi.fn(async () =>
      htmlResponse('<head><meta property="og:title" content="Hi" /></head>')
    );
    const result = await fetchTextHardened("https://example.com/a", {
      fetchImpl,
      assertPublic: fakeGate,
      dispatcher: null,
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.html).toContain("og:title");
  });

  it("follows a redirect and re-gates the redirect target host (302 → public host succeeds)", async () => {
    const seen: string[] = [];
    const fetchImpl = vi.fn(async (url: string) => {
      seen.push(url);
      if (url === "https://example.com/start") {
        return new Response(null, { status: 302, headers: { location: "https://elsewhere.example.org/final" } });
      }
      return htmlResponse("<head>final</head>");
    });
    const result = await fetchTextHardened("https://example.com/start", {
      fetchImpl,
      assertPublic: fakeGate,
      dispatcher: null,
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.finalUrl).toBe("https://elsewhere.example.org/final");
    // The redirect target was fetched (re-gated through the host gate first).
    expect(seen).toContain("https://elsewhere.example.org/final");
  });

  it("REJECTS a 302 redirect to a private host (the untested M3 redirect re-gate path)", async () => {
    const seen: string[] = [];
    const fetchImpl = vi.fn(async (url: string) => {
      seen.push(url);
      if (url === "https://example.com/start") {
        // Redirect to a literal private IP — the per-hop re-gate must block it
        // BEFORE the second fetch happens.
        return new Response(null, { status: 302, headers: { location: "http://169.254.169.254/latest/meta-data" } });
      }
      return htmlResponse("<head>SHOULD NOT REACH</head>");
    });
    const result = await fetchTextHardened("https://example.com/start", {
      fetchImpl,
      assertPublic: fakeGate,
      dispatcher: null,
    });
    expect(result.ok).toBe(false);
    // The private redirect target was NEVER fetched.
    expect(seen).not.toContain("http://169.254.169.254/latest/meta-data");
  });

  it("FAILS (fail-open) on a non-html content-type", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response("{}", { status: 200, headers: { "content-type": "application/json" } })
    );
    const result = await fetchTextHardened("https://example.com/json", {
      fetchImpl,
      assertPublic: fakeGate,
      dispatcher: null,
    });
    expect(result.ok).toBe(false);
  });

  it("FAILS after exceeding the redirect cap", async () => {
    let n = 0;
    const fetchImpl = vi.fn(async () => {
      n += 1;
      return new Response(null, { status: 302, headers: { location: `https://example.com/r${n}` } });
    });
    const result = await fetchTextHardened("https://example.com/loop", {
      fetchImpl,
      assertPublic: fakeGate,
      dispatcher: null,
    });
    expect(result.ok).toBe(false);
  });
});
