"use client";

import { PlayCircle, History } from "lucide-react";
import { useSafeSession } from "@/hooks/use-safe-session";
import {
  useUserStore,
  selectContinueWatching,
  selectRecents,
  selectIsHydrated,
} from "@/stores/user";
import { WideCarousel } from "@/components/features/media/wide-carousel";

/**
 * Continue Watching section for logged-in users.
 * Shows at the top of the homepage.
 */
export function ContinueWatchingSection() {
  const { status } = useSafeSession();
  const isHydrated = useUserStore(selectIsHydrated);
  const continueWatching = useUserStore(selectContinueWatching);

  // Don't render anything for unauthenticated users
  if (status !== "authenticated") {
    return null;
  }

  // Show loading state while hydrating
  if (!isHydrated) {
    return (
      <WideCarousel
        title="Continue Watching"
        items={[]}
        icon={<PlayCircle className="h-5 w-5 text-brand" />}
        loading
      />
    );
  }

  // Don't render if no continue watching data
  if (continueWatching.length === 0) {
    return null;
  }

  return (
    <WideCarousel
      title="Continue Watching"
      items={continueWatching}
      icon={<PlayCircle className="h-5 w-5 text-brand" />}
      showWatchLinks
    />
  );
}

/**
 * Recent Visits section for logged-in users.
 * Shows after trending sections on the homepage.
 */
export function RecentVisitsSection() {
  const { status } = useSafeSession();
  const isHydrated = useUserStore(selectIsHydrated);
  const recents = useUserStore(selectRecents);

  // Don't render anything for unauthenticated users or while hydrating
  if (status !== "authenticated" || !isHydrated) {
    return null;
  }

  // Don't render if no recent visits
  if (recents.length === 0) {
    return null;
  }

  return (
    <WideCarousel
      title="Recent Visits"
      items={recents}
      icon={<History className="h-5 w-5 text-brand" />}
    />
  );
}

/**
 * Combined personalized sections (legacy - for backwards compatibility).
 * Use ContinueWatchingSection and RecentVisitsSection separately for more control.
 */
export function PersonalizedSections() {
  return (
    <div className="space-y-12">
      <ContinueWatchingSection />
      <RecentVisitsSection />
    </div>
  );
}
