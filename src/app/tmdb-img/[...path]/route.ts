import { parseTmdbImagePath } from "@/lib/tmdb-img/path";

export const runtime = "nodejs";

const UPSTREAM = "https://image.tmdb.org";
// TMDB image files are content-addressed (a new image gets a new file name).
const CACHE_OK = "public, max-age=31536000, s-maxage=31536000, immutable";
const CACHE_MISS = "public, max-age=300, s-maxage=300";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ path: string[] }> },
): Promise<Response> {
  const { path } = await params;
  const tmdbPath = parseTmdbImagePath(path);
  if (!tmdbPath) {
    return new Response("Not found", { status: 404, headers: { "Cache-Control": CACHE_MISS } });
  }
  try {
    const upstream = await fetch(`${UPSTREAM}${tmdbPath}`, { signal: AbortSignal.timeout(10_000) });
    const type = upstream.headers.get("content-type") ?? "";
    if (!upstream.ok || !upstream.body || !type.startsWith("image/")) {
      return new Response("Not found", {
        status: upstream.status === 404 ? 404 : 502,
        headers: { "Cache-Control": upstream.status === 404 ? CACHE_MISS : "no-store" },
      });
    }
    return new Response(upstream.body, {
      status: 200,
      headers: {
        "Content-Type": type,
        "Cache-Control": CACHE_OK,
        "X-Robots-Tag": "noindex",
        ...(upstream.headers.get("content-length")
          ? { "Content-Length": upstream.headers.get("content-length") as string }
          : {}),
      },
    });
  } catch {
    return new Response("Upstream error", { status: 502, headers: { "Cache-Control": "no-store" } });
  }
}
