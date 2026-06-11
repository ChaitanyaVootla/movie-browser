"use client";

import { useState, useEffect } from "react";

/**
 * Height in px of the virtual keyboard overlapping the layout viewport.
 *
 * On Android this is ~0: the app opts into `interactive-widget=resizes-content`
 * (see the root layout viewport export), so the keyboard resizes the layout
 * viewport itself and fixed/dvh elements track it natively. iOS ignores that
 * setting and overlays the keyboard, so this visualViewport fallback is what
 * keeps fixed-bottom chat UI above the keyboard there.
 */
export function useKeyboardInset(): number {
  const [inset, setInset] = useState(0);

  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;

    const handleResize = () => {
      const keyboardH = window.innerHeight - viewport.height - viewport.offsetTop;
      setInset(Math.max(0, keyboardH));
    };

    viewport.addEventListener("resize", handleResize);
    viewport.addEventListener("scroll", handleResize);
    return () => {
      viewport.removeEventListener("resize", handleResize);
      viewport.removeEventListener("scroll", handleResize);
    };
  }, []);

  return inset;
}
