"use client";

import { motion, AnimatePresence, type Variants } from "framer-motion";
import { cn } from "@/lib/utils";
import { forwardRef, useImperativeHandle, useState, useCallback, useMemo } from "react";

// =============================================================================
// Radiating Pulse Rings - emanate outward on activation
// =============================================================================

interface PulseRingsProps {
  isActive: boolean;
  color?: string;
  ringCount?: number;
}

export function PulseRings({ isActive, color = "brand", ringCount = 3 }: PulseRingsProps) {
  return (
    <AnimatePresence>
      {isActive && (
        <>
          {Array.from({ length: ringCount }).map((_, i) => (
            <motion.div
              key={i}
              initial={{ scale: 0.8, opacity: 0.6 }}
              animate={{ scale: 2.5, opacity: 0 }}
              exit={{ opacity: 0 }}
              transition={{
                duration: 0.8,
                delay: i * 0.12,
                ease: [0.4, 0, 0.2, 1],
              }}
              className={cn(
                "absolute inset-0 rounded-full pointer-events-none",
                `border-2 border-${color}/40`
              )}
              style={{
                borderColor: `hsl(var(--${color}) / 0.4)`,
              }}
            />
          ))}
        </>
      )}
    </AnimatePresence>
  );
}

// =============================================================================
// Glow Burst - expands and fades
// =============================================================================

interface GlowBurstProps {
  isActive: boolean;
  color?: string;
}

export function GlowBurst({ isActive, color = "brand" }: GlowBurstProps) {
  return (
    <AnimatePresence>
      {isActive && (
        <motion.div
          initial={{ scale: 0.5, opacity: 0.8 }}
          animate={{ scale: 1.8, opacity: 0 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.6, ease: [0.4, 0, 0.2, 1] }}
          className="absolute inset-0 rounded-full pointer-events-none"
          style={{
            background: `radial-gradient(circle, hsl(var(--${color}) / 0.4) 0%, transparent 70%)`,
          }}
        />
      )}
    </AnimatePresence>
  );
}

// =============================================================================
// Animated Checkmark SVG - draws itself in
// =============================================================================

interface AnimatedCheckProps {
  isVisible: boolean;
  className?: string;
  onComplete?: () => void;
}

const checkVariants: Variants = {
  hidden: {
    pathLength: 0,
    opacity: 0,
  },
  visible: {
    pathLength: 1,
    opacity: 1,
    transition: {
      pathLength: { duration: 0.4, ease: [0.65, 0, 0.35, 1] },
      opacity: { duration: 0.1 },
    },
  },
};

export function AnimatedCheck({ isVisible, className, onComplete }: AnimatedCheckProps) {
  return (
    <AnimatePresence>
      {isVisible && (
        <motion.svg
          viewBox="0 0 24 24"
          fill="none"
          className={cn("w-full h-full", className)}
          initial="hidden"
          animate="visible"
          exit="hidden"
          onAnimationComplete={onComplete}
        >
          <motion.path
            d="M5 12.5L10 17.5L19 6.5"
            stroke="currentColor"
            strokeWidth={2.5}
            strokeLinecap="round"
            strokeLinejoin="round"
            variants={checkVariants}
          />
        </motion.svg>
      )}
    </AnimatePresence>
  );
}

// =============================================================================
// Shine Sweep - diagonal light sweep across element
// =============================================================================

interface ShineSweepProps {
  isActive: boolean;
}

export function ShineSweep({ isActive }: ShineSweepProps) {
  return (
    <AnimatePresence>
      {isActive && (
        <motion.div
          initial={{ x: "-100%", opacity: 0 }}
          animate={{ x: "200%", opacity: [0, 1, 1, 0] }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.6, ease: "easeInOut" }}
          className="absolute inset-0 pointer-events-none overflow-hidden rounded-full"
        >
          <div
            className="absolute inset-y-0 w-1/3 -skew-x-12"
            style={{
              background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.4), transparent)",
            }}
          />
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// =============================================================================
// Particle Burst - small dots that radiate outward
// =============================================================================

interface ParticleBurstProps {
  isActive: boolean;
  particleCount?: number;
  color?: string;
}

export function ParticleBurst({ isActive, particleCount = 8, color = "brand" }: ParticleBurstProps) {
  const particles = useMemo(
    () =>
      Array.from({ length: particleCount }).map((_, i) => {
        const angle = (i / particleCount) * 360;
        const distance = 24 + Math.random() * 12;
        const size = 3 + Math.random() * 2;
        const delay = Math.random() * 0.1;
        return { angle, distance, size, delay, id: i };
      }),
    [particleCount]
  );

  return (
    <AnimatePresence>
      {isActive && (
        <>
          {particles.map((p) => (
            <motion.div
              key={p.id}
              initial={{
                scale: 0,
                x: 0,
                y: 0,
                opacity: 1,
              }}
              animate={{
                scale: [0, 1, 0.5],
                x: Math.cos((p.angle * Math.PI) / 180) * p.distance,
                y: Math.sin((p.angle * Math.PI) / 180) * p.distance,
                opacity: [1, 1, 0],
              }}
              transition={{
                duration: 0.5,
                delay: p.delay,
                ease: [0.4, 0, 0.2, 1],
              }}
              className="absolute left-1/2 top-1/2 rounded-full pointer-events-none"
              style={{
                width: p.size,
                height: p.size,
                marginLeft: -p.size / 2,
                marginTop: -p.size / 2,
                backgroundColor: `hsl(var(--${color}))`,
              }}
            />
          ))}
        </>
      )}
    </AnimatePresence>
  );
}

// =============================================================================
// Morphing Icon Container - handles icon transitions with spring physics
// =============================================================================

interface IconMorphContainerProps {
  children: React.ReactNode;
  isActive: boolean;
  activeScale?: number;
  className?: string;
}

export function IconMorphContainer({
  children,
  isActive,
  activeScale = 1.15,
  className,
}: IconMorphContainerProps) {
  return (
    <motion.div
      animate={{
        scale: isActive ? [1, activeScale, 1] : 1,
        rotate: isActive ? [0, -8, 8, 0] : 0,
      }}
      transition={{
        scale: {
          duration: 0.4,
          ease: [0.34, 1.56, 0.64, 1], // Custom spring-like bounce
        },
        rotate: {
          duration: 0.4,
          ease: "easeInOut",
        },
      }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

// =============================================================================
// Action Button Wrapper - combines all effects
// =============================================================================

export interface ActionAnimationHandle {
  trigger: () => void;
}

interface ActionButtonAnimationProps {
  children: React.ReactNode;
  variant: "like" | "watchlist" | "watched" | "dislike";
  className?: string;
}

export const ActionButtonAnimation = forwardRef<ActionAnimationHandle, ActionButtonAnimationProps>(
  function ActionButtonAnimation({ children, variant, className }, ref) {
    const [isAnimating, setIsAnimating] = useState(false);

    const trigger = useCallback(() => {
      setIsAnimating(true);
      setTimeout(() => setIsAnimating(false), 800);
    }, []);

    useImperativeHandle(ref, () => ({ trigger }), [trigger]);

    // Different effects for different actions
    const showPulseRings = variant === "like" || variant === "watchlist";
    const showGlowBurst = variant === "like" || variant === "watched";
    const showParticles = variant === "like";
    const showShine = variant === "watched" || variant === "watchlist";

    return (
      <div className={cn("relative", className)}>
        {/* Background effects layer */}
        <div className="absolute inset-0 flex items-center justify-center">
          {showPulseRings && <PulseRings isActive={isAnimating} />}
          {showGlowBurst && <GlowBurst isActive={isAnimating} />}
          {showParticles && <ParticleBurst isActive={isAnimating} />}
        </div>

        {/* Shine sweep overlay */}
        {showShine && <ShineSweep isActive={isAnimating} />}

        {/* Content */}
        <IconMorphContainer isActive={isAnimating}>{children}</IconMorphContainer>
      </div>
    );
  }
);

// =============================================================================
// Shake Animation - for dislike/negative actions
// =============================================================================

interface ShakeContainerProps {
  children: React.ReactNode;
  isShaking: boolean;
  className?: string;
}

export function ShakeContainer({ children, isShaking, className }: ShakeContainerProps) {
  return (
    <motion.div
      animate={
        isShaking
          ? {
              x: [0, -3, 3, -3, 3, -2, 2, 0],
              rotate: [0, -2, 2, -2, 2, -1, 1, 0],
            }
          : {}
      }
      transition={{ duration: 0.5, ease: "easeInOut" }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

// =============================================================================
// Success Ring - circular progress that completes
// =============================================================================

interface SuccessRingProps {
  isActive: boolean;
  className?: string;
}

export function SuccessRing({ isActive, className }: SuccessRingProps) {
  return (
    <AnimatePresence>
      {isActive && (
        <motion.svg
          viewBox="0 0 36 36"
          className={cn("absolute inset-0 w-full h-full -rotate-90", className)}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <motion.circle
            cx="18"
            cy="18"
            r="16"
            fill="none"
            stroke="hsl(var(--brand))"
            strokeWidth="2"
            strokeLinecap="round"
            initial={{ pathLength: 0, opacity: 0.8 }}
            animate={{ pathLength: 1, opacity: [0.8, 0.8, 0] }}
            transition={{
              pathLength: { duration: 0.5, ease: [0.65, 0, 0.35, 1] },
              opacity: { duration: 0.7, times: [0, 0.7, 1] },
            }}
            style={{
              strokeDasharray: "100",
              strokeDashoffset: "0",
            }}
          />
        </motion.svg>
      )}
    </AnimatePresence>
  );
}
