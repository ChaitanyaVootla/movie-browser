"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

/**
 * ScrollToTop - Handles scroll restoration on route changes
 * 
 * Uses a subtle fade-in approach rather than jarring instant scroll:
 * 1. Instantly scrolls to top (no animation - this happens during page transition)
 * 2. The page content fades in naturally via the loading/Suspense states
 * 
 * This is placed once in the layout and handles all route changes.
 */
export function ScrollToTop() {
  const pathname = usePathname();
  const isFirstRender = useRef(true);

  useEffect(() => {
    // Skip first render - don't scroll on initial page load
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }

    // Scroll to top instantly when pathname changes
    // The instant scroll happens during the route transition,
    // so users don't see the jarring jump - they just see the new page from the top
    window.scrollTo(0, 0);
  }, [pathname]);

  return null;
}

