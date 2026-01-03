"use client";

import { useId } from "react";
import { cn } from "@/lib/utils";

interface AIIconProps {
  className?: string;
  size?: number;
  animated?: boolean;
}

/**
 * Sleek AI spark icon - modern and minimal with animated spikes
 */
export function AISparkIcon({ className, size = 20, animated = true }: AIIconProps) {
  const uniqueId = useId();
  
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      {animated && (
        <style>{`
          @keyframes spike-pulse-${uniqueId.replace(/:/g, "")} {
            0%, 100% { opacity: 0.4; transform: scale(0.8); }
            50% { opacity: 1; transform: scale(1.05); }
          }
          .spike-${uniqueId.replace(/:/g, "")} {
            transform-origin: center;
            animation: spike-pulse-${uniqueId.replace(/:/g, "")} 2.5s ease-in-out infinite;
          }
        `}</style>
      )}
      
      {/* Main vertical spark */}
      <path
        d="M12 3C12 3 13 8 13 10C13 11.1 12.55 12 12 12C11.45 12 11 11.1 11 10C11 8 12 3 12 3Z"
        fill="currentColor"
      />
      <path
        d="M12 21C12 21 11 16 11 14C11 12.9 11.45 12 12 12C12.55 12 13 12.9 13 14C13 16 12 21 12 21Z"
        fill="currentColor"
      />
      
      {/* Horizontal spark */}
      <path
        d="M3 12C3 12 8 11 10 11C11.1 11 12 11.45 12 12C12 12.55 11.1 13 10 13C8 13 3 12 3 12Z"
        fill="currentColor"
      />
      <path
        d="M21 12C21 12 16 13 14 13C12.9 13 12 12.55 12 12C12 11.45 12.9 11 14 11C16 11 21 12 21 12Z"
        fill="currentColor"
      />
      
      {/* Diagonal sparks - animated with staggered delays */}
      <path
        className={animated ? `spike-${uniqueId.replace(/:/g, "")}` : undefined}
        style={animated ? { animationDelay: "0s" } : { opacity: 0.7 }}
        d="M5.64 5.64C5.64 5.64 9.17 7.76 10.24 8.83C10.93 9.52 11.17 10.35 10.76 10.76C10.35 11.17 9.52 10.93 8.83 10.24C7.76 9.17 5.64 5.64 5.64 5.64Z"
        fill="currentColor"
      />
      <path
        className={animated ? `spike-${uniqueId.replace(/:/g, "")}` : undefined}
        style={animated ? { animationDelay: "0.6s" } : { opacity: 0.7 }}
        d="M18.36 18.36C18.36 18.36 14.83 16.24 13.76 15.17C13.07 14.48 12.83 13.65 13.24 13.24C13.65 12.83 14.48 13.07 15.17 13.76C16.24 14.83 18.36 18.36 18.36 18.36Z"
        fill="currentColor"
      />
      <path
        className={animated ? `spike-${uniqueId.replace(/:/g, "")}` : undefined}
        style={animated ? { animationDelay: "1.2s" } : { opacity: 0.7 }}
        d="M5.64 18.36C5.64 18.36 7.76 14.83 8.83 13.76C9.52 13.07 10.35 12.83 10.76 13.24C11.17 13.65 10.93 14.48 10.24 15.17C9.17 16.24 5.64 18.36 5.64 18.36Z"
        fill="currentColor"
      />
      <path
        className={animated ? `spike-${uniqueId.replace(/:/g, "")}` : undefined}
        style={animated ? { animationDelay: "1.8s" } : { opacity: 0.7 }}
        d="M18.36 5.64C18.36 5.64 16.24 9.17 15.17 10.24C14.48 10.93 13.65 11.17 13.24 10.76C12.83 10.35 13.07 9.52 13.76 8.83C14.83 7.76 18.36 5.64 18.36 5.64Z"
        fill="currentColor"
      />
    </svg>
  );
}

/**
 * Minimal AI icon - just the core symbol, super clean
 */
export function AIIconMinimal({ className, size = 20 }: AIIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      {/* Central star burst */}
      <path
        d="M12 2L13.5 9.5L21 8L14.5 12L21 16L13.5 14.5L12 22L10.5 14.5L3 16L9.5 12L3 8L10.5 9.5L12 2Z"
        fill="currentColor"
        opacity="0.9"
      />
    </svg>
  );
}

/**
 * Gradient AI icon with animated glow effect
 */
export function AIGlowIcon({ className, size = 20, animated = false }: AIIconProps) {
  const id = useId();
  
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn(animated && "animate-spin-slow", className)}
      style={{ animationDuration: "8s" }}
    >
      <defs>
        <radialGradient id={`${id}-grad`} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="currentColor" stopOpacity="1" />
          <stop offset="100%" stopColor="currentColor" stopOpacity="0.3" />
        </radialGradient>
      </defs>
      
      {/* Outer glow ring */}
      <circle 
        cx="12" 
        cy="12" 
        r="10" 
        stroke={`url(#${id}-grad)`}
        strokeWidth="1"
        fill="none"
        opacity="0.3"
      />
      
      {/* Inner structure */}
      <circle cx="12" cy="12" r="3" fill="currentColor" />
      
      {/* Orbital dots */}
      <circle cx="12" cy="5" r="1.5" fill="currentColor" opacity="0.8" />
      <circle cx="18" cy="9.5" r="1.5" fill="currentColor" opacity="0.8" />
      <circle cx="18" cy="14.5" r="1.5" fill="currentColor" opacity="0.8" />
      <circle cx="12" cy="19" r="1.5" fill="currentColor" opacity="0.8" />
      <circle cx="6" cy="14.5" r="1.5" fill="currentColor" opacity="0.8" />
      <circle cx="6" cy="9.5" r="1.5" fill="currentColor" opacity="0.8" />
    </svg>
  );
}
