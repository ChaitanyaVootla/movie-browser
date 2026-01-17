"use client";

import { motion, AnimatePresence } from "framer-motion";
import { ArrowRight } from "lucide-react";
import { AISparkIcon } from "./ai-icon";
import { cn } from "@/lib/utils";
import type { IdleCircleProps } from "./types";

// =============================================================================
// IdleCircle Component - Smooth morphing animation
// =============================================================================

export function IdleCircle({
  onExpand,
  showPrompt,
  prompt,
  hasActiveConversation,
}: IdleCircleProps) {
  // If there's an active conversation, clicking should restore it (no prompt)
  const isAwake = showPrompt && prompt && !hasActiveConversation;

  return (
    <motion.button
      onClick={() => onExpand(isAwake ? prompt : undefined)}
      data-testid="ai-assistant-trigger"
      role="button"
      aria-label={isAwake && prompt ? prompt.text : "Open AI Assistant"}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") onExpand(isAwake ? prompt : undefined);
      }}
      layout
      initial={false}
      animate={{
        width: isAwake ? "auto" : 40,
        height: 40,
        paddingLeft: isAwake ? 14 : 0,
        paddingRight: isAwake ? 14 : 0,
      }}
      transition={{
        layout: { duration: 0.35, ease: [0.4, 0, 0.2, 1] },
        width: { duration: 0.35, ease: [0.4, 0, 0.2, 1] },
        height: { duration: 0.35, ease: [0.4, 0, 0.2, 1] },
        paddingLeft: { duration: 0.35, ease: [0.4, 0, 0.2, 1] },
        paddingRight: { duration: 0.35, ease: [0.4, 0, 0.2, 1] },
      }}
      className={cn(
        "relative flex items-center justify-center cursor-pointer rounded-full",
        "bg-background/90 backdrop-blur-md",
        "border border-border/50",
        "shadow-lg shadow-black/10",
        "hover:shadow-xl hover:shadow-black/15",
        "hover:border-brand/30"
      )}
    >
      {/* Awake state glow ring */}
      <AnimatePresence>
        {isAwake && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="absolute -inset-px rounded-full ring-1 ring-brand/40 shadow-[0_0_10px_2px] shadow-brand/30 pointer-events-none"
          />
        )}
      </AnimatePresence>

      {/* Icon - always present, animates size and position */}
      <motion.div
        layout
        className="relative shrink-0"
        animate={{
          scale: isAwake ? 0.75 : 1,
        }}
        transition={{ duration: 0.35, ease: [0.4, 0, 0.2, 1] }}
      >
        <motion.div
          animate={isAwake ? { rotate: [0, 15, -15, 0] } : { rotate: 0 }}
          transition={
            isAwake ? { duration: 0.5, repeat: Infinity, repeatDelay: 2 } : { duration: 0.2 }
          }
        >
          <AISparkIcon size={22} className="text-brand" />
        </motion.div>

        {/* Idle pulse ring - only when dormant and no active conversation */}
        <AnimatePresence>
          {!isAwake && !hasActiveConversation && (
            <motion.div
              initial={{ scale: 1, opacity: 0.5 }}
              animate={{ scale: [1, 1.8, 1.8], opacity: [0.5, 0, 0] }}
              exit={{ opacity: 0 }}
              transition={{ duration: 2.5, repeat: Infinity, repeatDelay: 3, ease: "easeOut" }}
              className="absolute inset-0 rounded-full border-2 border-brand/20"
            />
          )}
        </AnimatePresence>
      </motion.div>

      {/* Active conversation indicator dot */}
      <AnimatePresence>
        {hasActiveConversation && !isAwake && (
          <motion.div
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="absolute -top-0.5 -right-0.5 w-3 h-3 rounded-full bg-brand border-2 border-background shadow-sm"
          />
        )}
      </AnimatePresence>

      {/* Text content - animates width and opacity */}
      <AnimatePresence>
        {isAwake && prompt && (
          <motion.div
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: "auto", opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{
              width: { duration: 0.35, ease: [0.4, 0, 0.2, 1] },
              opacity: { duration: 0.2, delay: 0.1 },
            }}
            className="flex items-center gap-2 overflow-hidden"
          >
            <span className="text-sm font-medium text-foreground whitespace-nowrap pl-2">
              {prompt.text}
            </span>
            <motion.div
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -8 }}
              transition={{ duration: 0.2, delay: 0.15 }}
            >
              <ArrowRight className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.button>
  );
}
