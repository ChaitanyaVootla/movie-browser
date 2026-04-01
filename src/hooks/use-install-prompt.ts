"use client";

import { useState, useEffect, useCallback } from "react";
import { useSyncExternalStore } from "react";

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

// Detect standalone mode without triggering effect-based setState
const emptySubscribe = () => () => {};
const getInstalled = () =>
  typeof window !== "undefined" &&
  window.matchMedia("(display-mode: standalone)").matches;
const getInstalledServer = () => false;

const getIsIOS = () => {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  return (
    /iPad|iPhone|iPod/.test(ua) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
};
const getIsIOSServer = () => false;

export function useInstallPrompt() {
  const isInstalled = useSyncExternalStore(
    emptySubscribe,
    getInstalled,
    getInstalledServer
  );
  const isIOS = useSyncExternalStore(
    emptySubscribe,
    getIsIOS,
    getIsIOSServer
  );

  const [deferredPrompt, setDeferredPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [wasInstalled, setWasInstalled] = useState(false);

  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    const installedHandler = () => {
      setWasInstalled(true);
      setDeferredPrompt(null);
    };

    window.addEventListener("beforeinstallprompt", handler);
    window.addEventListener("appinstalled", installedHandler);

    return () => {
      window.removeEventListener("beforeinstallprompt", handler);
      window.removeEventListener("appinstalled", installedHandler);
    };
  }, []);

  const promptInstall = useCallback(async () => {
    if (!deferredPrompt) return false;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    setDeferredPrompt(null);
    return outcome === "accepted";
  }, [deferredPrompt]);

  return {
    canPrompt: !!deferredPrompt,
    isInstalled: isInstalled || wasInstalled,
    isIOS,
    promptInstall,
  };
}
