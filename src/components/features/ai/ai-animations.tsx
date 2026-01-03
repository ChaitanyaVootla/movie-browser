"use client";

import { motion, AnimatePresence, type Variants } from "framer-motion";
import { cn } from "@/lib/utils";

// =============================================================================
// Thinking Indicator (wave bars)
// =============================================================================

interface ThinkingIndicatorProps {
  className?: string;
}

const waveVariants: Variants = {
  initial: { scaleY: 0.4 },
  animate: (i: number) => ({
    scaleY: [0.4, 1, 0.4],
    transition: {
      duration: 0.6,
      repeat: Infinity,
      delay: i * 0.08,
      ease: "easeInOut",
    },
  }),
};

export function ThinkingIndicator({ className }: ThinkingIndicatorProps) {
  return (
    <div className={cn("flex items-center justify-center gap-[3px]", className)}>
      {[0, 1, 2, 3, 4].map((i) => (
        <motion.div
          key={i}
          custom={i}
          variants={waveVariants}
          initial="initial"
          animate="animate"
          className="w-[3px] h-4 rounded-full bg-brand/70"
          style={{ originY: 0.5 }}
        />
      ))}
    </div>
  );
}

// =============================================================================
// Bottom Screen Glow (subtle loading indicator)
// =============================================================================

interface BottomGlowProps {
  isActive: boolean;
  className?: string;
}

export function BottomGlow({ isActive, className }: BottomGlowProps) {
  return (
    <AnimatePresence>
      {isActive && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
          className={cn(
            "fixed left-0 right-0 bottom-0 z-100 pointer-events-none",
            className
          )}
        >
          {/* Subtle gradient glow */}
          <motion.div
            className="h-8 bg-linear-to-t from-brand/15 to-transparent"
            animate={{ opacity: [0.6, 1, 0.6] }}
            transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
          />
          {/* Thin line at the bottom */}
          <motion.div
            className="h-[2px] w-full bg-brand/60"
            animate={{ opacity: [0.5, 0.8, 0.5] }}
            transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
          />
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// =============================================================================
// Glow Container (pulsing border for loading states)
// =============================================================================

interface GlowContainerProps {
  isActive: boolean;
  children: React.ReactNode;
  className?: string;
  borderRadius?: number;
}

export function GlowContainer({
  isActive,
  children,
  className,
  borderRadius = 16,
}: GlowContainerProps) {
  return (
    <div className={cn("relative", className)}>
      {/* Subtle pulsing border glow */}
      <AnimatePresence>
        {isActive && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="absolute -inset-px pointer-events-none ring-1 ring-brand/25"
            style={{ borderRadius: borderRadius + 1 }}
          >
            <motion.div
              className="absolute inset-0 shadow-[0_0_10px_1px] shadow-brand/20"
              style={{ borderRadius: borderRadius + 1 }}
              animate={{ opacity: [0.4, 0.6, 0.4] }}
              transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
            />
          </motion.div>
        )}
      </AnimatePresence>
      <div className="relative z-10">{children}</div>
    </div>
  );
}
