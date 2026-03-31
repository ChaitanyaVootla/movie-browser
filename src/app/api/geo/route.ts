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
import { resolveGeo } from "@/lib/geoip";

export async function GET(request: Request): Promise<NextResponse> {
  const { country, city } = resolveGeo(request.headers);

  return NextResponse.json(
    { country, city },
    {
      headers: {
        "Cache-Control": "private, max-age=3600",
      },
    }
  );
}
