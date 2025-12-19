"use client";

import { useEffect, useCallback, useRef } from "react";
import { useSession, signIn } from "next-auth/react";

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: GoogleOneTapConfig) => void;
          prompt: (callback?: (notification: GoogleNotification) => void) => void;
          cancel: () => void;
          renderButton: (
            parent: HTMLElement,
            options: GoogleButtonOptions
          ) => void;
        };
      };
    };
  }
}

interface GoogleOneTapConfig {
  client_id: string;
  callback: (response: { credential: string }) => void;
  auto_select?: boolean;
  cancel_on_tap_outside?: boolean;
  context?: "signin" | "signup" | "use";
  itp_support?: boolean;
  use_fedcm_for_prompt?: boolean;
  prompt_parent_id?: string;
}

interface GoogleButtonOptions {
  type?: "standard" | "icon";
  theme?: "outline" | "filled_blue" | "filled_black";
  size?: "large" | "medium" | "small";
  text?: "signin_with" | "signup_with" | "continue_with" | "signin";
  shape?: "rectangular" | "pill" | "circle" | "square";
  logo_alignment?: "left" | "center";
  width?: string | number;
}

interface GoogleNotification {
  isNotDisplayed: () => boolean;
  isSkippedMoment: () => boolean;
  isDismissedMoment: () => boolean;
  getNotDisplayedReason: () => string;
  getSkippedReason: () => string;
  getDismissedReason: () => string;
}

const ONE_TAP_COOLDOWN_KEY = "google_one_tap_dismissed";
const ONE_TAP_COOLDOWN_DURATION = 24 * 60 * 60 * 1000; // 24 hours

interface GoogleOneTapProps {
  /**
   * Delay in ms before showing One Tap prompt (default: 1500ms)
   * Gives users time to orient themselves on the page
   */
  delay?: number;
  /**
   * Parent element ID for the One Tap prompt positioning
   */
  promptParentId?: string;
}

export function GoogleOneTap({ delay = 1500, promptParentId }: GoogleOneTapProps) {
  const { status } = useSession();
  const scriptLoaded = useRef(false);
  const promptShown = useRef(false);

  // Check if user recently dismissed One Tap
  const isOnCooldown = useCallback(() => {
    if (typeof window === "undefined") return true;
    
    const dismissedAt = localStorage.getItem(ONE_TAP_COOLDOWN_KEY);
    if (!dismissedAt) return false;
    
    const dismissedTime = parseInt(dismissedAt, 10);
    const now = Date.now();
    
    // Clear expired cooldown
    if (now - dismissedTime > ONE_TAP_COOLDOWN_DURATION) {
      localStorage.removeItem(ONE_TAP_COOLDOWN_KEY);
      return false;
    }
    
    return true;
  }, []);

  // Set cooldown when user dismisses
  const setCooldown = useCallback(() => {
    if (typeof window === "undefined") return;
    localStorage.setItem(ONE_TAP_COOLDOWN_KEY, Date.now().toString());
  }, []);

  // Handle Google One Tap credential response
  const handleCredentialResponse = useCallback(
    async (response: { credential: string }) => {
      try {
        const result = await signIn("google-one-tap", {
          credential: response.credential,
          redirect: false,
        });

        if (result?.error) {
          console.error("Google One Tap authentication failed:", result.error);
        }
      } catch (error) {
        console.error("Google One Tap sign-in error:", error);
      }
    },
    []
  );

  // Initialize and show Google One Tap
  const initializeOneTap = useCallback(() => {
    if (!window.google?.accounts?.id) return;
    if (promptShown.current) return;

    const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
    if (!clientId) {
      console.warn("NEXT_PUBLIC_GOOGLE_CLIENT_ID not configured");
      return;
    }

    try {
      window.google.accounts.id.initialize({
        client_id: clientId,
        callback: handleCredentialResponse,
        auto_select: false, // Don't auto-select to be less aggressive
        cancel_on_tap_outside: true,
        context: "signin",
        itp_support: true,
        use_fedcm_for_prompt: true, // Use FedCM for better browser support
        ...(promptParentId && { prompt_parent_id: promptParentId }),
      });

      promptShown.current = true;

      window.google.accounts.id.prompt((notification) => {
        if (notification.isNotDisplayed()) {
          const reason = notification.getNotDisplayedReason();
          // These are expected scenarios, not errors
          if (reason === "suppressed_by_user" || reason === "opt_out_or_no_session") {
            console.debug("One Tap not shown:", reason);
          } else if (reason === "browser_not_supported") {
            console.debug("Browser does not support One Tap");
          } else {
            console.debug("One Tap not displayed:", reason);
          }
        } else if (notification.isDismissedMoment()) {
          const reason = notification.getDismissedReason();
          // User intentionally closed - set cooldown
          if (reason === "user_cancel" || reason === "cancel_called") {
            setCooldown();
            console.debug("User dismissed One Tap, cooldown set");
          }
        } else if (notification.isSkippedMoment()) {
          const reason = notification.getSkippedReason();
          if (reason === "tap_outside") {
            // Tapped outside - shorter cooldown might be appropriate
            console.debug("One Tap skipped:", reason);
          }
        }
      });
    } catch (error) {
      console.error("Error initializing Google One Tap:", error);
    }
  }, [handleCredentialResponse, promptParentId, setCooldown]);

  // Load Google Identity Services script
  useEffect(() => {
    // Only run for unauthenticated users
    if (status !== "unauthenticated") return;
    
    // Check cooldown
    if (isOnCooldown()) {
      console.debug("One Tap on cooldown, skipping");
      return;
    }

    // Already loaded
    if (scriptLoaded.current && window.google?.accounts?.id) {
      const timer = setTimeout(initializeOneTap, delay);
      return () => clearTimeout(timer);
    }

    // Load script
    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.defer = true;
    script.onload = () => {
      scriptLoaded.current = true;
      // Delay showing prompt to let user orient on page
      setTimeout(initializeOneTap, delay);
    };
    script.onerror = () => {
      console.error("Failed to load Google Identity Services");
    };

    document.head.appendChild(script);

    return () => {
      // Cleanup: cancel any pending prompts
      if (window.google?.accounts?.id) {
        try {
          window.google.accounts.id.cancel();
        } catch {
          // Silent fail - API might not be fully loaded
        }
      }
    };
  }, [status, delay, initializeOneTap, isOnCooldown]);

  // Component renders nothing - One Tap is a browser-level overlay
  return null;
}

