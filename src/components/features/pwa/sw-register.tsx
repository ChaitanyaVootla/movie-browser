"use client";

import { useEffect } from "react";

export function ServiceWorkerRegister() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      // scope "/" is REQUIRED: the script lives under /serwist/, and without an
      // explicit scope the SW would only control /serwist/* (i.e. no pages).
      // The serwist route sends `Service-Worker-Allowed: /` to permit this.
      navigator.serviceWorker
        .register("/serwist/sw.js", { scope: "/" })
        .catch(() => {
          // SW registration failed — non-critical, ignore
        });
    }
  }, []);

  return null;
}
