"use client";

import { useSession } from "next-auth/react";
import { PlayCircle, History } from "lucide-react";
import { useUserStore, selectContinueWatching, selectRecents, selectIsHydrated } from "@/stores/user";
import { WideCarousel } from "@/components/features/media/wide-carousel";

/**
 * Personalized homepage sections that require authentication.
 * Shows Continue Watching and Recent Visits for logged-in users.
 */
export function PersonalizedSections() {
  const { status } = useSession();
  const isHydrated = useUserStore(selectIsHydrated);
  const continueWatching = useUserStore(selectContinueWatching);
  const recents = useUserStore(selectRecents);

  // Don't render anything for unauthenticated users
  if (status !== "authenticated") {
    return null;
  }

  // Show loading state while hydrating
  if (!isHydrated) {
    return (
      <div className="space-y-12">
        <WideCarousel
          title="Continue Watching"
          items={[]}
          icon={<PlayCircle className="h-5 w-5 text-brand" />}
          loading
        />
      </div>
    );
  }

  // Don't render if no personalized data
  if (continueWatching.length === 0 && recents.length === 0) {
    return null;
  }

  return (
    <div className="space-y-12">
      {/* Continue Watching */}
      {continueWatching.length > 0 && (
        <WideCarousel
          title="Continue Watching"
          items={continueWatching}
          icon={<PlayCircle className="h-5 w-5 text-brand" />}
          showWatchLinks
        />
      )}

      {/* Recent Visits */}
      {recents.length > 0 && (
        <WideCarousel
          title="Recent Visits"
          items={recents}
          icon={<History className="h-5 w-5 text-brand" />}
        />
      )}
    </div>
  );
}

