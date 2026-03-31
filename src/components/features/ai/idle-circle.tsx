"use client";

import { motion, AnimatePresence } from "framer-motion";
import { ArrowRight, MessageCircle, Lightbulb, X } from "lucide-react";
import { AISparkIcon } from "./ai-icon";
import { cn } from "@/lib/utils";
import { useAnalytics } from "@/hooks/use-analytics";
import type { IdleCircleProps, PromptConfig } from "./types";

const TRANSITION_EASE = [0.4, 0, 0.2, 1] as const;

// =============================================================================
// IdleCircle Component - Smooth morphing animation
// =============================================================================

export function IdleCircle({
  onExpand,
  showPrompt,
  prompt,
  hasActiveConversation,
  postWatch,
  onPostWatchQuestion,
  onPostWatchDismiss,
}: IdleCircleProps) {
  const { trackAIChatOpen } = useAnalytics();

  // Post-watch mode takes priority over normal prompt cycling
  const isPostWatch = !!postWatch;
  // If there's an active conversation, clicking should restore it (no prompt)
  const isAwake = isPostWatch || (showPrompt && prompt && !hasActiveConversation);

  if (isPostWatch && postWatch) {
    return (
      <PostWatchBubble
        postWatch={postWatch}
        onQuestionClick={(message) => {
          trackAIChatOpen();
          onPostWatchQuestion?.(message);
        }}
        onDismiss={() => {
          onPostWatchDismiss?.();
        }}
      />
    );
  }

  return (
    <motion.button
      onClick={() => {
        trackAIChatOpen();
        onExpand(isAwake ? (prompt as PromptConfig) : undefined);
      }}
      data-testid="ai-assistant-trigger"
      role="button"
      aria-label={isAwake && prompt ? prompt.text : "Open Cue"}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          trackAIChatOpen();
          onExpand(isAwake ? (prompt as PromptConfig) : undefined);
        }
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
        layout: { duration: 0.35, ease: TRANSITION_EASE },
        width: { duration: 0.35, ease: TRANSITION_EASE },
        height: { duration: 0.35, ease: TRANSITION_EASE },
        paddingLeft: { duration: 0.35, ease: TRANSITION_EASE },
        paddingRight: { duration: 0.35, ease: TRANSITION_EASE },
      }}
      className={cn(
        "relative flex items-center justify-center cursor-pointer rounded-full",
        "bg-background/90 backdrop-blur-md",
        "border border-border/50",
        "shadow-lg shadow-black/10",
        "hover:shadow-xl hover:shadow-black/15",
        "hover:border-brand/30",
        // Allow wider expansion for longer AI-enriched questions
        "max-w-[85vw] sm:max-w-[60vw] md:max-w-[50vw]"
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
        transition={{ duration: 0.35, ease: TRANSITION_EASE }}
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
              width: { duration: 0.35, ease: TRANSITION_EASE },
              opacity: { duration: 0.2, delay: 0.1 },
            }}
            className="flex items-center gap-2 overflow-hidden"
          >
            {/* Use prompt.message (full text) instead of prompt.text (truncated to 25 chars) */}
            <span className="text-sm font-medium text-foreground whitespace-nowrap pl-2">
              {prompt.message}
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

// =============================================================================
// PostWatchBubble - Expanded pill with discussion prompts
// =============================================================================

interface PostWatchBubbleProps {
  postWatch: NonNullable<IdleCircleProps["postWatch"]>;
  onQuestionClick: (message: string) => void;
  onDismiss: () => void;
}

function PostWatchBubble({ postWatch, onQuestionClick, onDismiss }: PostWatchBubbleProps) {
  const questions = postWatch.questions.slice(0, 2);
  const trivia = postWatch.trivia.slice(0, 2);
  const contextSuffix = ` [About: ${postWatch.title}, TMDB ID: ${postWatch.tmdbId}]`;
  let staggerIndex = 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 10, scale: 0.95 }}
      transition={{ duration: 0.35, ease: TRANSITION_EASE }}
      className={cn(
        "relative flex flex-col gap-2.5 p-3.5 rounded-2xl",
        "bg-background/95 backdrop-blur-md",
        "border border-brand/30",
        "shadow-lg shadow-brand/10",
        "max-w-[90vw] sm:max-w-[420px]"
      )}
    >
      {/* Ambient glow */}
      <motion.div
        className="absolute -inset-px rounded-2xl ring-1 ring-brand/30 shadow-[0_0_15px_3px] shadow-brand/15 pointer-events-none"
        animate={{ opacity: [0.5, 0.8, 0.5] }}
        transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut" }}
      />

      {/* Header + close */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <motion.div
            animate={{ rotate: [0, 10, -10, 0] }}
            transition={{ duration: 0.6, repeat: Infinity, repeatDelay: 3 }}
          >
            <AISparkIcon size={16} className="text-brand shrink-0" />
          </motion.div>
          <span className="text-xs font-medium text-brand">
            Just watched {postWatch.title}?
          </span>
        </div>
        <button
          onClick={onDismiss}
          className="p-1 rounded-full text-muted-foreground/40 hover:text-muted-foreground hover:bg-white/5 transition-colors"
          aria-label="Dismiss"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Trivia nuggets */}
      {trivia.length > 0 && (
        <div className="flex flex-col gap-1.5">
          {trivia.map((t, i) => (
            <motion.div
              key={`trivia-${i}`}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.25, delay: 0.15 + staggerIndex++ * 0.08 }}
              className="flex gap-2 px-3 py-2 rounded-xl bg-brand/5 border border-brand/10"
            >
              <Lightbulb className="w-3.5 h-3.5 text-brand/70 shrink-0 mt-0.5" />
              <span className="text-xs text-foreground/70 leading-relaxed">{t}</span>
            </motion.div>
          ))}
        </div>
      )}

      {/* Question pills */}
      {questions.length > 0 && (
        <div className="flex flex-col gap-1.5">
          {questions.map((q, i) => (
            <motion.button
              key={`q-${i}`}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.25, delay: 0.15 + staggerIndex++ * 0.08 }}
              onClick={() => onQuestionClick(q + contextSuffix)}
              className={cn(
                "flex items-center gap-2 px-3 py-2 rounded-xl text-left",
                "bg-white/5 hover:bg-brand/10 border border-white/5 hover:border-brand/20",
                "transition-colors duration-150 cursor-pointer group"
              )}
            >
              <MessageCircle className="w-3.5 h-3.5 text-muted-foreground group-hover:text-brand shrink-0 transition-colors" />
              <span className="text-xs text-foreground/80 group-hover:text-foreground transition-colors">
                {q}
              </span>
            </motion.button>
          ))}
        </div>
      )}
    </motion.div>
  );
}
