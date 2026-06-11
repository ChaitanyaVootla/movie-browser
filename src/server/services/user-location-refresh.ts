/**
 * Intermittent user location + last-active refresh.
 *
 * Sign-in stamps metadata.profile.location, but JWT sessions live ~30 days, so
 * sign-in alone leaves location (and lastActiveAt) stale for a month at a
 * time. The analytics ingest endpoint sees every authenticated page-view
 * batch — it calls maybeRefreshUserLocation, which at most once per
 * CHECK_INTERVAL per user re-resolves geo from the request headers and
 * rewrites the stored location only when it actually changed (or its stamp is
 * older than LOCATION_MAX_AGE). lastActiveAt is bumped on every throttled
 * check, making the admin Users tab's "last visited" live instead of
 * sign-in-frozen.
 *
 * Fire-and-forget: never awaited by callers, never throws.
 */

import type { Prisma } from "@prisma/client";
import { prisma } from "@/server/db/postgres";
import {
  resolveUserLocation,
  mergeProfileLocation,
  shouldRefreshStoredLocation,
  extractProfileLocation,
} from "@/lib/user-location";
import { apiLogger } from "@/lib/logger";

const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000; // re-check a user at most every 6h
const LOCATION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // re-stamp unchanged locations weekly

/** Per-process throttle: email -> last check epoch ms. */
const lastCheckedByEmail = new Map<string, number>();
const THROTTLE_MAP_CAP = 10_000;

export function maybeRefreshUserLocation(
  email: string,
  headers: { get: (name: string) => string | null },
): void {
  try {
    const nowMs = Date.now();
    const last = lastCheckedByEmail.get(email);
    if (last !== undefined && nowMs - last < CHECK_INTERVAL_MS) return;
    if (lastCheckedByEmail.size >= THROTTLE_MAP_CAP) lastCheckedByEmail.clear();
    lastCheckedByEmail.set(email, nowMs);

    const location = resolveUserLocation(headers);

    void (async () => {
      const user = await prisma.user.findUnique({
        where: { email },
        select: { metadata: true },
      });
      if (!user) return;

      const now = new Date();
      const data: Prisma.UserUpdateInput = { lastActiveAt: now };
      if (
        location &&
        shouldRefreshStoredLocation(
          extractProfileLocation(user.metadata),
          location,
          now,
          LOCATION_MAX_AGE_MS,
        )
      ) {
        data.metadata = mergeProfileLocation(user.metadata, {
          ...location,
          updatedAt: now.toISOString(),
        }) as Prisma.InputJsonValue;
      }
      await prisma.user.update({ where: { email }, data });
    })().catch((error: unknown) => {
      apiLogger.debug({
        event: "user_location_refresh_failed",
        error: error instanceof Error ? error.message : String(error),
      });
    });
  } catch {
    // Best-effort by contract — never let location refresh affect the caller.
  }
}
