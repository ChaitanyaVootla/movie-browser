import { createSerwistRoute } from "@serwist/turbopack";

// Precache list. Serwist's default is `.next/static/**` PLUS `public/**/*`,
// which on web-1 (Nov 16 2026) meant every SW install downloaded all 13
// sitemaps (12 MB), robots.txt, llms.txt and ~60 icons: 405 entries per new
// visitor, the public ones each an origin round-trip. Only the build's static
// assets plus the few public files the app shell / offline page needs.
const serwistRoute = createSerwistRoute({
  swSrc: "src/app/sw.ts",
  globPatterns: [
    ".next/static/**/*.{js,css,html,ico,apng,png,avif,jpg,jpeg,jfif,pjpeg,pjp,gif,svg,webp,json,webmanifest}",
    "public/{manifest.json,favicon.ico,popcorn-lite.png}",
  ],
});

export const { dynamic, dynamicParams, revalidate } = serwistRoute;

// Serwist returns { path: string } but Next.js 16 catch-all needs { path: string[] }
export async function generateStaticParams() {
  const params = await serwistRoute.generateStaticParams();
  return params.map(({ path }) => ({ path: [path] }));
}

// Next.js 16 passes { path: string[] } for catch-all but Serwist expects { path: string }
export async function GET(
  request: Request,
  { params }: { params: Promise<{ path?: string[] }> }
) {
  const { path } = await params;
  const serwistPath = Array.isArray(path) ? path.join("/") : (path ?? "");
  return serwistRoute.GET(request, {
    params: Promise.resolve({ path: serwistPath }),
  });
}
