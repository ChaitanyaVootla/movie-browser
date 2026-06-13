"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { toast } from "sonner";
import { getUsernameStatus } from "@/server/actions/profile";

const SNOOZE_KEY = "username-prompt-snoozed";
const TOAST_ID = "username-claim-prompt";

/**
 * First-time username nudge for authenticated users without a username.
 *
 * Renders nothing (no modal, no overlay) — it raises a single non-blocking
 * sonner toast with a "Claim" action that routes to /settings. This must
 * NEVER trap focus or intercept clicks on page content: a modal Dialog here
 * overlaid detail pages and made the Rate pill et al. unclickable.
 *
 * Shows once per device — acting on it OR dismissing it sets a localStorage
 * snooze flag, so it never re-fires on subsequent loads/navigations. Mounted
 * in the root layout.
 */
export function UsernameClaimPrompt() {
  const { status } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (status !== "authenticated") return;
    if (typeof window === "undefined") return;
    if (window.localStorage.getItem(SNOOZE_KEY) === "1") return;

    let cancelled = false;
    const snooze = () => window.localStorage.setItem(SNOOZE_KEY, "1");

    getUsernameStatus()
      .then((result) => {
        if (cancelled || result.username !== null) return;
        toast("Claim your username", {
          id: TOAST_ID,
          description:
            "Get a public profile — your diary, favorites & reviews at a shareable link.",
          // Persist until the user acts or dismisses; a toast can't block content.
          duration: Infinity,
          // Explicit close affordance so dismissing is trivial (no modal trap).
          closeButton: true,
          action: {
            label: "Claim",
            onClick: () => {
              snooze();
              router.push("/settings");
            },
          },
          cancel: {
            label: "Maybe later",
            onClick: snooze,
          },
          // Any dismissal (close button / swipe / programmatic close) = "maybe
          // later" — snooze so we never nag again on later loads/navigations.
          onDismiss: snooze,
          onAutoClose: snooze,
        });
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [status, router]);

  return null;
}
