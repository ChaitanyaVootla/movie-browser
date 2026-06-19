"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useSession } from "next-auth/react";
import { getProfileViewerState } from "@/server/actions/profile";

/**
 * Resolves the viewer↔profile relationship ONCE and shares it with every
 * client island on the page (follow button, owner toolbar, setup card, visitor
 * empty state). Before this, each island called getProfileViewerState
 * independently — up to 4 identical auth+DB roundtrips that resolved at
 * different times, so the islands popped in raggedly.
 *
 * ISR-safe: the profile HTML carries no viewer data; this fetches client-side
 * after hydration (same contract as the islands it replaces).
 */
interface ViewerContextValue {
  /** false until the relationship is known (islands render their skeleton/null). */
  resolved: boolean;
  authenticated: boolean;
  isOwner: boolean;
  isFollowing: boolean;
  setIsFollowing: (value: boolean) => void;
  /** Owner dashboard "Customize" mode (drag/resize widgets). */
  editMode: boolean;
  setEditMode: (value: boolean) => void;
}

const ViewerContext = createContext<ViewerContextValue | null>(null);

export function ProfileViewerProvider({
  username,
  children,
}: {
  username: string;
  children: ReactNode;
}) {
  const { status } = useSession();
  // Single state object so the effect performs at most ONE synchronous
  // setState per run (avoids cascading-render lint + extra renders).
  const [viewer, setViewer] = useState({ resolved: false, isOwner: false, isFollowing: false });
  const [editMode, setEditMode] = useState(false);

  useEffect(() => {
    if (status === "loading") return;
    let cancelled = false;
    // Authenticated → ask the server; otherwise resolve to "not owner, not
    // following" via a Promise so every setState stays in an async callback
    // (no synchronous setState in the effect body → no cascading renders).
    const lookup =
      status === "authenticated"
        ? getProfileViewerState(username)
        : Promise.resolve({ isOwner: false, isFollowing: false });
    lookup
      .then((s) => {
        if (!cancelled) setViewer({ resolved: true, isOwner: s.isOwner, isFollowing: s.isFollowing });
      })
      .catch(() => {
        if (!cancelled) setViewer({ resolved: true, isOwner: false, isFollowing: false });
      });
    return () => {
      cancelled = true;
    };
  }, [status, username]);

  const setIsFollowing = (value: boolean) =>
    setViewer((prev) => ({ ...prev, isFollowing: value }));

  return (
    <ViewerContext.Provider
      value={{
        resolved: viewer.resolved,
        authenticated: status === "authenticated",
        isOwner: viewer.isOwner,
        isFollowing: viewer.isFollowing,
        setIsFollowing,
        editMode,
        setEditMode,
      }}
    >
      {children}
    </ViewerContext.Provider>
  );
}

export function useProfileViewer(): ViewerContextValue {
  const ctx = useContext(ViewerContext);
  if (!ctx) {
    throw new Error("useProfileViewer must be used within a ProfileViewerProvider");
  }
  return ctx;
}
