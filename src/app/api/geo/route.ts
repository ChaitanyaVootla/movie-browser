/**
 * GeoIP Detection API
 *
 * GET /api/geo
 *
 * Returns the detected country code for the requesting client.
 * Used by the frontend to auto-detect country for the country selector
 * and watch provider display.
 */

import { NextResponse } from "next/server";
import { resolveGeo, lookupIP } from "@/lib/geoip";

export async function GET(request: Request): Promise<NextResponse> {
  const realIp = request.headers.get("x-real-ip");
  const forwardedFor = request.headers.get("x-forwarded-for");
  const ip = realIp || forwardedFor?.split(",")[0]?.trim() || "unknown";

  const { country, city } = resolveGeo(request.headers);
  const geoDetail = lookupIP(ip);

  return NextResponse.json(
    {
      country,
      city,
      // Debug — remove after confirming it works
      _debug: {
        ip,
        realIp,
        forwardedFor,
        geoResult: geoDetail,
      },
    },
    {
      headers: {
        "Cache-Control": "no-cache",
      },
    }
  );
}
