import { createSerwistRoute } from "@serwist/turbopack";

const serwistRoute = createSerwistRoute({
  swSrc: "src/app/sw.ts",
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
