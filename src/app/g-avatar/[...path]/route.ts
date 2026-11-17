import { parseGoogleAvatarPath } from "@/lib/tmdb-img/path";
import { proxyImage } from "@/lib/tmdb-img/proxy-image";

export const runtime = "nodejs";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ path: string[] }> },
): Promise<Response> {
  const p = parseGoogleAvatarPath((await params).path);
  return proxyImage(p ? `https://lh3.googleusercontent.com${p}` : null);
}
