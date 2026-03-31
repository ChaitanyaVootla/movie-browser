"use client";

import { motion, AnimatePresence, type Variants } from "framer-motion";
import { cn } from "@/lib/utils";
import { AISparkIcon } from "./ai-icon";

// =============================================================================
// Orbiting Dots - Clean thinking animation
// =============================================================================

interface OrbitingDotsProps {
  className?: string;
  size?: "sm" | "md" | "lg";
}

export function OrbitingDots({ className, size = "md" }: OrbitingDotsProps) {
  const sizeConfig = {
    sm: { container: 24, dotSize: 4, orbit: 8 },
    md: { container: 32, dotSize: 5, orbit: 11 },
    lg: { container: 40, dotSize: 6, orbit: 14 },
  };
  const config = sizeConfig[size];
  const center = config.container / 2;

  return (
    <div
      className={cn("relative", className)}
      style={{ width: config.container, height: config.container }}
    >
      {/* Rotating container with dots */}
      <motion.div
        className="absolute inset-0"
        animate={{ rotate: 360 }}
        transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }}
      >
        {[0, 1, 2].map((i) => {
          const angle = (i * 120 * Math.PI) / 180;
          const x = center + Math.cos(angle) * config.orbit - config.dotSize / 2;
          const y = center + Math.sin(angle) * config.orbit - config.dotSize / 2;
          return (
            <motion.div
              key={i}
              className="absolute rounded-full bg-brand"
              style={{
                width: config.dotSize,
                height: config.dotSize,
                left: x,
                top: y,
              }}
              animate={{ opacity: [0.4, 1, 0.4] }}
              transition={{
                duration: 1,
                repeat: Infinity,
                delay: i * 0.33,
                ease: "easeInOut",
              }}
            />
          );
        })}
      </motion.div>

      {/* Center dot */}
      <div
        className="absolute rounded-full bg-brand/60"
        style={{
          width: config.dotSize,
          height: config.dotSize,
          left: center - config.dotSize / 2,
          top: center - config.dotSize / 2,
        }}
      />
    </div>
  );
}

// =============================================================================
// Pulsing Spark - Simple icon-based thinking animation
// =============================================================================

interface PulsingSparkProps {
  className?: string;
  size?: number;
}

export function PulsingSpark({ className, size = 20 }: PulsingSparkProps) {
  return (
    <motion.div
      className={className}
      animate={{ scale: [1, 1.15, 1], opacity: [0.7, 1, 0.7] }}
      transition={{ duration: 1.2, repeat: Infinity, ease: "easeInOut" }}
    >
      <AISparkIcon size={size} className="text-brand" />
    </motion.div>
  );
}

// =============================================================================
// ThinkingIndicator (wave bars) - kept as primary loading indicator
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
          className={cn("fixed left-0 right-0 bottom-0 z-100 pointer-events-none", className)}
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

// =============================================================================
// Wake-Up Border (cascading glow from top → bottom on viewport edges)
// =============================================================================

interface WakeUpBorderProps {
  isActive: boolean;
  /** Called when the cascade animation completes */
  onComplete?: () => void;
}

/**
 * Symmetric glowing lines that start at top center and cascade down both
 * viewport edges, drawing the user's eye to the agent bubble at the bottom.
 *
 * Each side has:
 * - A moving highlight segment (~20vh tall) that traces top→bottom
 * - A trailing glow that fades in behind it
 * - The whole thing fades out after the trace completes
 */
export function WakeUpBorder({ isActive, onComplete }: WakeUpBorderProps) {
  return (
    <AnimatePresence>
      {isActive && (
        <motion.div
          className="fixed inset-0 z-[60] pointer-events-none"
          initial={{ opacity: 1 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: 0.5, delay: 0.3 } }}
        >
          {/* Left edge — trailing glow (revealed top to bottom) */}
          <motion.div
            className="absolute top-0 left-0 w-[2px] h-full"
            style={{
              background:
                "linear-gradient(to bottom, var(--color-brand) 0%, transparent 100%)",
            }}
            initial={{ clipPath: "inset(0 0 100% 0)" }}
            animate={{ clipPath: "inset(0 0 0% 0)" }}
            transition={{ duration: 1, ease: [0.4, 0, 0.2, 1] }}
          />
          {/* Left edge — soft glow */}
          <motion.div
            className="absolute top-0 left-0 w-[6px] h-full"
            style={{
              background:
                "linear-gradient(to bottom, var(--color-brand) 0%, transparent 100%)",
              opacity: 0.15,
              filter: "blur(4px)",
            }}
            initial={{ clipPath: "inset(0 0 100% 0)" }}
            animate={{ clipPath: "inset(0 0 0% 0)" }}
            transition={{ duration: 1, ease: [0.4, 0, 0.2, 1] }}
          />

          {/* Right edge — trailing glow */}
          <motion.div
            className="absolute top-0 right-0 w-[2px] h-full"
            style={{
              background:
                "linear-gradient(to bottom, var(--color-brand) 0%, transparent 100%)",
            }}
            initial={{ clipPath: "inset(0 0 100% 0)" }}
            animate={{ clipPath: "inset(0 0 0% 0)" }}
            transition={{ duration: 1, ease: [0.4, 0, 0.2, 1] }}
          />
          {/* Right edge — soft glow */}
          <motion.div
            className="absolute top-0 right-0 w-[6px] h-full"
            style={{
              background:
                "linear-gradient(to bottom, var(--color-brand) 0%, transparent 100%)",
              opacity: 0.15,
              filter: "blur(4px)",
            }}
            initial={{ clipPath: "inset(0 0 100% 0)" }}
            animate={{ clipPath: "inset(0 0 0% 0)" }}
            transition={{ duration: 1, ease: [0.4, 0, 0.2, 1] }}
          />

          {/* Left — moving highlight segment */}
          <motion.div
            className="absolute left-0 w-[2px]"
            style={{
              height: "20vh",
              background:
                "linear-gradient(to bottom, transparent, var(--color-brand), transparent)",
              boxShadow: "0 0 12px 2px var(--color-brand)",
            }}
            initial={{ top: "-20vh" }}
            animate={{ top: "100vh" }}
            transition={{ duration: 0.9, ease: [0.4, 0, 0.2, 1] }}
          />

          {/* Right — moving highlight segment */}
          <motion.div
            className="absolute right-0 w-[2px]"
            style={{
              height: "20vh",
              background:
                "linear-gradient(to bottom, transparent, var(--color-brand), transparent)",
              boxShadow: "0 0 12px 2px var(--color-brand)",
            }}
            initial={{ top: "-20vh" }}
            animate={{ top: "100vh" }}
            transition={{ duration: 0.9, ease: [0.4, 0, 0.2, 1] }}
            onAnimationComplete={onComplete}
          />

          {/* Bottom convergence flash — brief glow where lines reach the agent */}
          <motion.div
            className="absolute bottom-0 left-0 right-0 h-16"
            style={{
              background:
                "radial-gradient(ellipse at bottom center, var(--color-brand), transparent 70%)",
            }}
            initial={{ opacity: 0 }}
            animate={{ opacity: [0, 0.3, 0] }}
            transition={{ duration: 0.8, delay: 0.8, ease: "easeOut" }}
          />
        </motion.div>
      )}
    </AnimatePresence>
  );
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
