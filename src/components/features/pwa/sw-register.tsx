"use client";

import { useEffect } from "react";

export function ServiceWorkerRegister() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/serwist/sw.js").catch(() => {
        // SW registration failed — non-critical, ignore
      });
    }
  }, []);

  return null;
}
