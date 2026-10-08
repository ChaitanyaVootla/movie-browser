"use client";

import { LazyMotion } from "framer-motion";

const loadFeatures = () => import("./motion-features").then((mod) => mod.default);

/**
 * framer-motion via LazyMotion: components use the tiny `m.*` renderer and the
 * animation features load as their own chunk after hydration, instead of the
 * full `motion` bundle (~35KB gz of framer-motion + motion-dom) sitting in the
 * root JS of every route.
 *
 * `strict` makes any leftover `motion.*` usage throw in dev/tests, so a new
 * component cannot silently re-import the full bundle. Use `m` from
 * "framer-motion", never `motion`.
 */
export function MotionProvider({ children }: { children: React.ReactNode }) {
  return (
    <LazyMotion features={loadFeatures} strict>
      {children}
    </LazyMotion>
  );
}
