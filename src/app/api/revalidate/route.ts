/**
 * On-demand ISR revalidation — called by the deploy pipeline right after PM2
 * restart, and usable by an operator to refresh specific titles.
 *
 * Why this exists: `/` and `/topics` are prerendered at CI BUILD time, where
 * env vars are placeholders (no real TMDB key), so the baked HTML can have
 * empty data sections (June 2026: homepage shipped with no trending carousel).
 * Re-rendering here happens ON THE BOX with real runtime env.
 *
 * Body (all optional; empty body = the deploy default paths):
 *   { paths: ["/", ...] }                       → revalidatePath (origin ISR only)
 *   { titles: [{ mediaType: "movie", id: 157336, title: "Interstellar" }] }
 *                                                → origin ISR drop + queued,
 *                                                  rate-limited Cloudflare purge
 *                                                  (src/server/services/cdn)
 * `revalidatePath` only works on pages since cache-handler.cjs started reading
 * the page's `x-next-cache-tags` header (Oct 2026) — before that it was a
 * silent no-op for every cached page.
 *
 * Auth: shared-secret header compared against AUTH_SECRET (already present in
 * both CI secrets and the box env). Localhost-only by deploy convention, but
 * the secret check makes it safe even if exposed through the proxy.
 */

import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { notifyTitleContentChanged } from "@/server/services/cdn";

const BodySchema = z.object({
  paths: z.array(z.string().startsWith("/")).max(50).optional(),
  titles: z
    .array(
      z.object({
        mediaType: z.enum(["movie", "series"]),
        id: z.number().int().positive(),
        title: z.string().max(500).nullable().optional(),
      }),
    )
    .max(200)
    .optional(),
});

const DEFAULT_PATHS = ["/", "/topics", "/topics/all", "/browse"];

export async function POST(request: NextRequest) {
  const secret = request.headers.get("x-revalidate-secret");
  if (!process.env.AUTH_SECRET || secret !== process.env.AUTH_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: z.infer<typeof BodySchema>;
  try {
    body = BodySchema.parse(await request.json().catch(() => ({})));
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const titles = body.titles ?? [];
  const paths = body.paths?.length ? body.paths : titles.length ? [] : DEFAULT_PATHS;

  for (const path of paths) {
    revalidatePath(path);
  }
  for (const t of titles) {
    notifyTitleContentChanged({ mediaType: t.mediaType, id: t.id, title: t.title ?? null });
  }

  return NextResponse.json({
    revalidated: paths,
    titlesQueued: titles.length,
    timestamp: new Date().toISOString(),
  });
}
