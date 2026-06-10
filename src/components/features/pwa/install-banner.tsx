"use client";

import { useState, useEffect } from "react";
import { X, Download, Share } from "lucide-react";
import { useInstallPrompt } from "@/hooks/use-install-prompt";
import { cn } from "@/lib/utils";
import { useAnalytics } from "@/hooks/use-analytics";

const DISMISS_KEY = "pwa-install-dismissed";
const MIN_PAGES_BEFORE_PROMPT = 3;
const PAGE_COUNT_KEY = "pwa-page-count";

export function InstallBanner() {
  const { canPrompt, isInstalled, isIOS, promptInstall } = useInstallPrompt();
  const [show, setShow] = useState(false);
  const { trackAction } = useAnalytics();

  useEffect(() => {
    if (isInstalled) return;

    // Don't show if previously dismissed
    const dismissed = localStorage.getItem(DISMISS_KEY);
    if (dismissed) return;

    // Count pages visited — only show after engagement
    const count = parseInt(localStorage.getItem(PAGE_COUNT_KEY) || "0", 10) + 1;
    localStorage.setItem(PAGE_COUNT_KEY, count.toString());

    if (count >= MIN_PAGES_BEFORE_PROMPT && (canPrompt || isIOS)) {
      // Delay slightly so it doesn't flash during navigation
      const timer = setTimeout(() => setShow(true), 1500);
      return () => clearTimeout(timer);
    }
  }, [canPrompt, isIOS, isInstalled]);

  const handleInstall = async () => {
    if (canPrompt) {
      const accepted = await promptInstall();
      trackAction({
        action: "pwa_install",
        metadata: { outcome: accepted ? "accepted" : "dismissed" },
      });
    }
    setShow(false);
  };

  const handleDismiss = () => {
    setShow(false);
    localStorage.setItem(DISMISS_KEY, Date.now().toString());
    trackAction({
      action: "pwa_install",
      metadata: { outcome: "banner_dismissed" },
    });
  };

  if (!show) return null;

  return (
    <div
      className={cn(
        // Keep clear of the AI assistant's reserved bottom-center zone:
        // mobile sits above bottom nav + idle bubble; desktop docks bottom-right.
        "fixed bottom-[calc(8rem+env(safe-area-inset-bottom,0px))] inset-x-0 z-30",
        "px-4 md:px-0 md:bottom-4 md:left-auto md:right-4"
      )}
    >
      <div className="bg-card border border-border rounded-xl shadow-lg p-4 flex items-center gap-3 max-w-md w-full">
        <div className="flex-shrink-0 h-10 w-10 rounded-lg bg-brand/10 flex items-center justify-center">
          <Download className="h-5 w-5 text-brand" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm">Install Movie Browser</p>
          {isIOS ? (
            <p className="text-xs text-muted-foreground mt-0.5">
              Tap <Share className="inline h-3 w-3 -mt-0.5" /> then &ldquo;Add to
              Home Screen&rdquo;
            </p>
          ) : (
            <p className="text-xs text-muted-foreground mt-0.5">
              Get faster access and offline browsing
            </p>
          )}
        </div>
        {!isIOS && (
          <button
            onClick={handleInstall}
            className="flex-shrink-0 px-4 py-1.5 rounded-full bg-brand text-brand-foreground text-sm font-medium hover:opacity-90 transition-opacity"
          >
            Install
          </button>
        )}
        <button
          onClick={handleDismiss}
          className="flex-shrink-0 p-1 rounded-full hover:bg-muted transition-colors"
          aria-label="Dismiss"
        >
          <X className="h-4 w-4 text-muted-foreground" />
        </button>
      </div>
    </div>
  );
}
