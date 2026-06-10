/**
 * On-demand ISR revalidation — called by the deploy pipeline right after PM2
 * restart.
 *
 * Why this exists: `/` and `/topics` are prerendered at CI BUILD time, where
 * env vars are placeholders (no real TMDB key), so the baked HTML can have
 * empty data sections (June 2026: homepage shipped with no trending carousel).
 * Re-rendering here happens ON THE BOX with real runtime env.
 *
 * Auth: shared-secret header compared against AUTH_SECRET (already present in
 * both CI secrets and the box env). Localhost-only by deploy convention, but
 * the secret check makes it safe even if exposed through the proxy.
 */

import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";

const BodySchema = z.object({
  paths: z.array(z.string().startsWith("/")).max(50).optional(),
});

const DEFAULT_PATHS = ["/", "/topics", "/topics/all"];

export async function POST(request: NextRequest) {
  const secret = request.headers.get("x-revalidate-secret");
  if (!process.env.AUTH_SECRET || secret !== process.env.AUTH_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let paths = DEFAULT_PATHS;
  try {
    const body = BodySchema.parse(await request.json().catch(() => ({})));
    if (body.paths?.length) paths = body.paths;
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  for (const path of paths) {
    revalidatePath(path);
  }

  return NextResponse.json({ revalidated: paths, timestamp: new Date().toISOString() });
}
