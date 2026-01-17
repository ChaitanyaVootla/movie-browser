/**
 * AI Questions Section
 *
 * Displays AI-generated questions as clickable buttons below the overview.
 * Clicking a question triggers the AI chat with that question.
 * Uses the same animated icon and glow effect as the AI chat bubble.
 */

"use client";

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
  if (!questions?.length) return null;

  return (
    <section className={cn("px-4 md:px-8 lg:px-12", className)}>
      <GlowContainer isActive={true} borderRadius={12}>
        <div className="rounded-xl bg-black/80 backdrop-blur-sm p-4 md:p-5">
          <div className="flex items-center gap-2 mb-3">
            <AISparkIcon size={16} className="text-brand" />
            <h3 className="text-sm font-medium text-muted-foreground">Ask about {title}</h3>
          </div>
          <div className="flex flex-wrap gap-2">
            {questions.map((question, index) => (
              <button
                key={index}
                onClick={() => triggerAIChat(question, title, year, tmdbId)}
                className={cn(
                  "inline-flex items-center",
                  "px-3 py-1.5 rounded-full",
                  "text-xs font-medium",
                  "bg-white/5 hover:bg-white/10",
                  "text-foreground/70 hover:text-foreground/90",
                  "border border-white/10 hover:border-white/30",
                  "transition-all duration-200",
                  "cursor-pointer"
                )}
              >
                {question}
              </button>
            ))}
          </div>
        </div>
      </GlowContainer>
    </section>
  );
}
