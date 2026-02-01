/**
 * AI Questions Section
 *
 * Displays AI-generated questions as clickable buttons below the overview.
 * Clicking a question triggers the AI chat with that question.
 * Uses the same animated icon and glow effect as the AI chat bubble.
 *
 * Features:
 * - Mobile: Shows 3 questions with "See more" expansion
 * - Hover animations for better interactivity
 * - Visual hint that clicking opens AI chat
 */

"use client";

import { useState } from "react";
import { MessageCircle, ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { AISparkIcon } from "@/components/features/ai/ai-icon";
import { GlowContainer } from "@/components/features/ai/ai-animations";

interface AIQuestionsSectionProps {
  questions: string[];
  title: string;
  year?: string;
  tmdbId: number;
  className?: string;
}

/**
 * Dispatch a custom event to trigger the AI chat with a specific question.
 * The AssistantFloaty listens for this event.
 * Appends movie context so the AI knows which movie the question is about.
 */
function triggerAIChat(question: string, title: string, year: string | undefined, tmdbId: number) {
  // Append movie context to the question for the AI agent
  const contextSuffix = year
    ? ` [About: ${title} (${year}), TMDB ID: ${tmdbId}]`
    : ` [About: ${title}, TMDB ID: ${tmdbId}]`;

  const event = new CustomEvent("ai-chat-trigger", {
    detail: { message: question + contextSuffix },
  });
  window.dispatchEvent(event);
}

export function AIQuestionsSection({
  questions,
  title,
  year,
  tmdbId,
  className,
}: AIQuestionsSectionProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  if (!questions?.length) return null;

  // Mobile: show 3 questions by default, desktop: show all
  const MOBILE_LIMIT = 3;
  const hasMore = questions.length > MOBILE_LIMIT;
  const visibleQuestions = isExpanded ? questions : questions.slice(0, MOBILE_LIMIT);

  return (
    <section className={cn("px-4 md:px-8 lg:px-12", className)}>
      <GlowContainer isActive={true} borderRadius={12}>
        <div className="rounded-xl bg-black/80 backdrop-blur-sm p-4 md:p-5">
          {/* Header with chat hint */}
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <AISparkIcon size={16} className="text-brand" />
              <h3 className="text-sm font-medium text-foreground/90">Ask about {title}</h3>
            </div>
            {/* Chat hint */}
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <MessageCircle className="h-3 w-3" />
              <span className="hidden sm:inline">Opens AI chat</span>
            </div>
          </div>

          {/* Questions - responsive grid that fills available space */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {visibleQuestions.map((question, index) => (
              <button
                key={index}
                onClick={() => triggerAIChat(question, title, year, tmdbId)}
                className={cn(
                  "flex items-center justify-start text-left",
                  "px-3 py-2 rounded-lg",
                  "text-xs font-medium",
                  "bg-white/5 hover:bg-brand/20",
                  "text-foreground/70 hover:text-foreground",
                  "border border-white/10 hover:border-brand/50",
                  "transition-all duration-200",
                  "hover:shadow-lg hover:shadow-brand/10",
                  "cursor-pointer",
                  "active:scale-[0.98]"
                )}
              >
                {question}
              </button>
            ))}
            {/* Desktop: Show remaining questions in same grid */}
            {hasMore && !isExpanded && questions.slice(MOBILE_LIMIT).map((question, index) => (
              <button
                key={index + MOBILE_LIMIT}
                onClick={() => triggerAIChat(question, title, year, tmdbId)}
                className={cn(
                  "hidden md:flex items-center justify-start text-left",
                  "px-3 py-2 rounded-lg",
                  "text-xs font-medium",
                  "bg-white/5 hover:bg-brand/20",
                  "text-foreground/70 hover:text-foreground",
                  "border border-white/10 hover:border-brand/50",
                  "transition-all duration-200",
                  "hover:shadow-lg hover:shadow-brand/10",
                  "cursor-pointer",
                  "active:scale-[0.98]"
                )}
              >
                {question}
              </button>
            ))}
          </div>

          {/* Mobile: See more/less toggle */}
          {hasMore && (
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className={cn(
                "mt-3 flex items-center gap-1 md:hidden",
                "text-[11px] font-medium text-muted-foreground hover:text-foreground/80",
                "transition-colors"
              )}
            >
              {isExpanded ? (
                <>
                  <ChevronUp className="h-3 w-3" />
                  <span>Show less</span>
                </>
              ) : (
                <>
                  <ChevronDown className="h-3 w-3" />
                  <span>See {questions.length - MOBILE_LIMIT} more questions</span>
                </>
              )}
            </button>
          )}
        </div>
      </GlowContainer>
    </section>
  );
}
