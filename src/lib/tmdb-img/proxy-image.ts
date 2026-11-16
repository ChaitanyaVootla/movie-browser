// Image files behind these proxies are content-addressed per URL (TMDB file
// names, YouTube video ids), so a year of edge/browser caching is safe.
const CACHE_OK = "public, max-age=31536000, s-maxage=31536000, immutable";
const CACHE_MISS = "public, max-age=300, s-maxage=300";

/** Stream an upstream image back with long cache headers; 404/502 otherwise. */
export async function proxyImage(upstreamUrl: string | null): Promise<Response> {
  if (!upstreamUrl) {
    return new Response("Not found", { status: 404, headers: { "Cache-Control": CACHE_MISS } });
  }
  try {
    const upstream = await fetch(upstreamUrl, { signal: AbortSignal.timeout(10_000) });
    const type = upstream.headers.get("content-type") ?? "";
    if (!upstream.ok || !upstream.body || !type.startsWith("image/")) {
      const notFound = upstream.status === 404;
      return new Response("Not found", {
        status: notFound ? 404 : 502,
        headers: { "Cache-Control": notFound ? CACHE_MISS : "no-store" },
      });
    }
    const length = upstream.headers.get("content-length");
    return new Response(upstream.body, {
      status: 200,
      headers: {
        "Content-Type": type,
        "Cache-Control": CACHE_OK,
        "X-Robots-Tag": "noindex",
        ...(length ? { "Content-Length": length } : {}),
      },
    });
  } catch {
    return new Response("Upstream error", { status: 502, headers: { "Cache-Control": "no-store" } });
  }
}
