import type { NextURL } from "next/dist/server/web/next-url";

/**
 * Build a middleware REWRITE target that Next treats as INTERNAL.
 *
 * Next decides internal vs external by comparing the rewrite's origin with the
 * request's `initURL`, which `next start` builds as
 * `<proto>://localhost:<port><path>` (proto = https when X-Forwarded-Proto says
 * so; see next/dist/server/lib/router-utils/resolve-routes.js). Same origin ->
 * served in-process. Different origin -> Next PROXIES the request over HTTP.
 *
 * Our proxy runs inside Auth.js's `auth()` wrapper, which re-bases
 * `req.nextUrl` onto AUTH_URL (https://themoviebrowser.com). So a plain
 * `req.nextUrl.clone()` rewrite always looked external: every `.md` twin and
 * every not-found rewrite was fetched back out through Cloudflare to whichever
 * box is live (found Nov 16 2026 on web-2: the Next process held a socket to
 * themoviebrowser.com's Cloudflare IP during a `.md` request). That doubled the
 * origin cost of the ~15-99k `.md` hits/day, and it is why the box's own IPs
 * had to be exempted from the Cloudflare WAF (ORIGIN_SELF_IPS).
 *
 * With PORT unset (dev servers started with `-p`), keep the old behaviour.
 */
export function internalRewriteUrl(
  nextUrl: NextURL,
  forwardedProto: string | null,
  port: string | undefined = process.env.PORT,
): NextURL {
  const url = nextUrl.clone();
  if (!port) return url;
  url.protocol = forwardedProto?.includes("https") ? "https:" : "http:";
  url.hostname = "localhost";
  url.port = port;
  return url;
}
