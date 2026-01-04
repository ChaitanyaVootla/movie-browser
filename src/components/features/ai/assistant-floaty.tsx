"use client";

import {
  useState,
  useCallback,
  useEffect,
  useRef,
  useMemo,
  memo,
  type KeyboardEvent,
} from "react";
import { motion, AnimatePresence } from "framer-motion";
import { usePathname } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import {
  X,
  ArrowUp,
  ArrowRight,
  Maximize2,
  Minimize2,
  RotateCcw,
  Film,
} from "lucide-react";
import { AISparkIcon } from "./ai-icon";
import { cn, getSlug } from "@/lib/utils";
import { CDN_IMAGE_BASE } from "@/lib/constants";
import {
  parseContent,
  parseMediaTags,
  stripAllTags,
  getDataFetchIds,
  type ParsedMediaTag,
} from "@/lib/ai/parse-media-tags";
import { useChatStream, type PageContext } from "@/hooks/use-chat-stream";
import { RichMessageContent, collectMediaTags } from "./rich-message-content";
import {
  ChatRatings,
  ChatWatchOptions,
  PersonChip,
  useTagData,
} from "./chat-tags";
import { GlowContainer, ThinkingIndicator, BottomGlow } from "./ai-animations";

// =============================================================================
// Types & Config
// =============================================================================

type FloatyState = "idle" | "active" | "expanded";

interface PromptConfig {
  text: string;
  message: string;
}

// Poster card dimensions
const CARD_WIDTH = 150;
const CARD_HEIGHT = 225;

// Animation timing
const TRANSITION_EASE = [0.4, 0, 0.2, 1] as const;

// =============================================================================
// Utilities
// =============================================================================

function extractCompleteMediaTags(content: string): ParsedMediaTag[] {
  return parseMediaTags(content);
}

function hasPartialTag(content: string): boolean {
  const partialTagRegex = /\[(MOVIE|SERIES):[^\]]*$/i;
  return partialTagRegex.test(content);
}

// =============================================================================
// Contextual Prompts
// =============================================================================

/**
 * Shuffle array and return first n items
 */
function pickRandom<T>(arr: T[], count: number): T[] {
  const shuffled = [...arr].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}

/**
 * Movie-specific prompts when on a movie detail page
 */
function getMovieDetailPrompts(title?: string): PromptConfig[] {
  const itemRef = title || "this movie";
  const allPrompts: PromptConfig[] = [
    { text: "Talk smack about it", message: `Talk smack about ${itemRef}` },
    { text: "Hype this up", message: `Hype up ${itemRef} - convince me to watch` },
    { text: "Hot take?", message: `What's your hot take on ${itemRef}?` },
    { text: "Is it overrated?", message: `Is ${itemRef} overrated?` },
    { text: "Be brutally honest", message: `Be brutally honest about ${itemRef}` },
    { text: "Sell me on it", message: `Sell me on ${itemRef}` },
    { text: "What's the vibe?", message: `What's the vibe of ${itemRef}?` },
    { text: "Roast it", message: `Roast ${itemRef}` },
    { text: "Worth my time?", message: `Is ${itemRef} worth watching?` },
    { text: "Similar movies", message: `Find movies similar to ${itemRef}` },
  ];
  return pickRandom(allPrompts, 3);
}

/**
 * Series-specific prompts when on a series detail page
 */
function getSeriesDetailPrompts(title?: string): PromptConfig[] {
  const itemRef = title || "this series";
  const allPrompts: PromptConfig[] = [
    { text: "Talk smack about it", message: `Talk smack about ${itemRef}` },
    { text: "Hype this up", message: `Hype up ${itemRef}` },
    { text: "Hot take?", message: `What's your hot take on ${itemRef}?` },
    { text: "Is it bingeworthy?", message: `Is ${itemRef} bingeworthy?` },
    { text: "Be brutally honest", message: `Be brutally honest about ${itemRef}` },
    { text: "Worth the commitment?", message: `Is ${itemRef} worth the time investment?` },
    { text: "Peak or overrated?", message: `Is ${itemRef} peak TV or overrated?` },
    { text: "Similar shows", message: `Find series similar to ${itemRef}` },
    { text: "What's the vibe?", message: `What's the vibe of ${itemRef}?` },
    { text: "Convince me", message: `Convince me to start ${itemRef}` },
  ];
  return pickRandom(allPrompts, 3);
}

/**
 * Person-specific prompts when on a person detail page
 */
function getPersonDetailPrompts(name?: string): PromptConfig[] {
  const personRef = name || "them";
  const allPrompts: PromptConfig[] = [
    { text: "What're they cooking?", message: `What is ${personRef} working on these days?` },
    { text: "Their best work", message: `What's ${personRef}'s best work?` },
    { text: "Underrated picks", message: `What's an underrated ${personRef} movie?` },
    { text: "Hot take", message: `What's your hot take on ${personRef}?` },
    { text: "Career peak?", message: `What was ${personRef}'s career peak?` },
    { text: "Must-watch", message: `Give me a must-watch ${personRef} movie` },
  ];
  return pickRandom(allPrompts, 3);
}

/**
 * Landing page / browse prompts
 */
function getLandingPrompts(): PromptConfig[] {
  const allPrompts: PromptConfig[] = [
    { text: "Surprise me", message: "Surprise me with something good" },
    { text: "What should I binge?", message: "What should I binge this weekend?" },
    { text: "Peak cinema", message: "Show me some peak cinema" },
    { text: "Underrated gems", message: "Show me some underrated gems" },
    { text: "Chaotic picks", message: "Give me something chaotic to watch" },
    { text: "Comfort watch", message: "I need a comfort watch" },
    { text: "Make me cry", message: "Recommend something that'll make me cry" },
    { text: "Mind-benders", message: "Show me some mind-bending movies" },
    { text: "90s nostalgia", message: "Give me some 90s nostalgia" },
    { text: "Foreign films", message: "Recommend some great foreign films" },
  ];
  // Always include "What's trending?" as the first one
  const trending: PromptConfig = { text: "What's trending?", message: "What's trending right now?" };
  const randomPicks = pickRandom(allPrompts, 3);
  return [trending, ...randomPicks];
}

function getContextualPrompts(pageContext: PageContext | null): PromptConfig[] {
  if (!pageContext) return getLandingPrompts();

  if (pageContext.mediaType === "movie" && pageContext.itemId) {
    return getMovieDetailPrompts(pageContext.itemTitle);
  }

  if (pageContext.mediaType === "series" && pageContext.itemId) {
    return getSeriesDetailPrompts(pageContext.itemTitle);
  }

  if (pageContext.mediaType === "person" && pageContext.itemId) {
    return getPersonDetailPrompts(pageContext.itemTitle);
  }

  if (pageContext.path?.includes("/browse") || pageContext.path?.includes("/topics")) {
    return getLandingPrompts();
  }

  return getLandingPrompts();
}

const IDLE_PROMPTS: PromptConfig[] = [
  { text: "What's trending?", message: "What's trending right now?" },
  { text: "Surprise me", message: "Surprise me with something good" },
  { text: "Got recommendations?", message: "Got any recommendations?" },
  { text: "What should I watch?", message: "What should I watch tonight?" },
];

// =============================================================================
// Idle Circle Component - Clean CSS-based transitions
// =============================================================================

interface IdleCircleProps {
  onExpand: (clickedPrompt?: PromptConfig) => void;
  showPrompt: boolean;
  prompt: PromptConfig | null;
}

function IdleCircle({ onExpand, showPrompt, prompt }: IdleCircleProps) {
  const isAwake = showPrompt && prompt;

  return (
    <button
      onClick={() => onExpand(isAwake ? prompt : undefined)}
      data-testid="ai-assistant-trigger"
      role="button"
      aria-label={isAwake && prompt ? prompt.text : "Open AI Assistant"}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") onExpand(isAwake ? prompt : undefined);
      }}
      className={cn(
        "ai-idle-btn relative flex items-center justify-center",
        "bg-background/90 backdrop-blur-md",
        "border border-border/50",
        "shadow-lg shadow-black/10",
        "hover:shadow-xl hover:shadow-black/15",
        "hover:border-brand/30",
        // Size and shape transitions via CSS
        isAwake
          ? "h-11 px-4 gap-2 rounded-full"
          : "h-12 w-12 rounded-full"
      )}
    >
      {/* Awake state glow ring */}
      {isAwake && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="absolute -inset-px rounded-full ring-1 ring-brand/40 shadow-[0_0_10px_2px] shadow-brand/30 pointer-events-none"
        />
      )}

      <AnimatePresence mode="wait">
        {isAwake ? (
          <motion.div
            key="prompt"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.2, ease: TRANSITION_EASE }}
            className="flex items-center gap-2"
          >
            <motion.div
              animate={{ rotate: [0, 15, -15, 0] }}
              transition={{ duration: 0.5, repeat: Infinity, repeatDelay: 2 }}
            >
              <AISparkIcon size={16} className="text-brand shrink-0" />
            </motion.div>
            <span className="text-sm font-medium text-foreground whitespace-nowrap">
              {prompt.text}
            </span>
            <ArrowRight className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
          </motion.div>
        ) : (
          <motion.div
            key="icon"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.2, ease: TRANSITION_EASE }}
            className="relative"
          >
            <AISparkIcon size={24} className="text-brand" />
            {/* Idle pulse ring */}
            <motion.div
              className="absolute inset-0 rounded-full border-2 border-brand/20"
              animate={{ scale: [1, 1.8, 1.8], opacity: [0.5, 0, 0] }}
              transition={{ duration: 2.5, repeat: Infinity, repeatDelay: 3, ease: "easeOut" }}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </button>
  );
}

// =============================================================================
// Poster Card Component
// =============================================================================

const PosterCardLarge = memo(function PosterCardLarge({ tag }: { tag: ParsedMediaTag }) {
  const [imgError, setImgError] = useState(false);

  const href =
    tag.id !== null
      ? `/${tag.type}/${tag.id}/${getSlug(tag.title)}`
      : `/browse?q=${encodeURIComponent(tag.title)}`;
  const posterUrl =
    tag.id !== null ? `${CDN_IMAGE_BASE}/${tag.type}/${tag.id}/poster.webp` : null;

  return (
    <Link
      href={href}
      className={cn(
        "group/card shrink-0 flex flex-col",
        "transition-transform duration-300",
        "hover:scale-[1.03]"
      )}
      style={{ width: CARD_WIDTH }}
    >
      <div
        className={cn(
          "relative overflow-hidden rounded-xl",
          "bg-neutral-900",
          "shadow-xl shadow-black/50",
          "ring-1 ring-white/15",
          "group-hover/card:shadow-2xl group-hover/card:shadow-black/70",
          "group-hover/card:ring-white/25",
          "transition-shadow duration-300"
        )}
        style={{ width: CARD_WIDTH, height: CARD_HEIGHT }}
      >
        {posterUrl && !imgError ? (
          <Image
            src={posterUrl}
            alt={tag.title}
            width={CARD_WIDTH}
            height={CARD_HEIGHT}
            className="object-cover"
            style={{ width: CARD_WIDTH, height: CARD_HEIGHT }}
            onError={() => setImgError(true)}
            unoptimized
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center bg-neutral-900">
            <Film className="w-12 h-12 text-white/40" />
          </div>
        )}
      </div>
      <p className="mt-2 text-sm font-semibold text-center text-white line-clamp-1 group-hover/card:text-brand transition-colors">
        {tag.title}
      </p>
      {tag.description && (
        <p className="mt-0.5 text-xs text-center text-white/60 line-clamp-3 leading-snug">
          {tag.description}
        </p>
      )}
    </Link>
  );
});

// =============================================================================
// Minimal Response View
// =============================================================================

interface MinimalViewProps {
  messages: ReturnType<typeof useChatStream>["messages"];
  isLoading: boolean;
  input: string;
  onInputChange: (value: string) => void;
  onSend: () => void;
  onExpand: () => void;
  onClose: () => void;
  prompts: PromptConfig[];
  featuredPrompt: PromptConfig | null;
  onPromptClick: (message: string) => void;
  pendingNavigation: ReturnType<typeof useChatStream>["pendingNavigation"];
  onNavigate: () => void;
}

function MinimalView({
  messages,
  isLoading,
  input,
  onInputChange,
  onSend,
  onExpand,
  onClose,
  prompts,
  featuredPrompt,
  onPromptClick,
  pendingNavigation,
  onNavigate,
}: MinimalViewProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  const lastAssistantMessage = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === "assistant") return messages[i];
    }
    return null;
  }, [messages]);

  const isWaitingForResponse =
    lastAssistantMessage?.isStreaming && !lastAssistantMessage?.content;

  const { mediaTags, cleanText, parsedContent, dataFetchIds, isReceivingTag } = useMemo(() => {
    const content = lastAssistantMessage?.content || "";
    if (!content) {
      return {
        mediaTags: [],
        cleanText: "",
        parsedContent: null,
        dataFetchIds: { movieIds: [], seriesIds: [], personIds: [] },
        isReceivingTag: false,
      };
    }

    const isStreaming = lastAssistantMessage?.isStreaming ?? false;
    const completeMediaTags = extractCompleteMediaTags(content);
    const receivingPartialTag = isStreaming && hasPartialTag(content);
    const parsed = parseContent(content);
    const fetchIds = getDataFetchIds(content);

    const stripped = stripAllTags(content)
      .replace(/`+/g, "")
      .replace(/\*+/g, "")
      .replace(/"+/g, "")
      .replace(/^[-•]\s*/gm, "")
      .replace(/^>\s*/gm, "")
      .replace(/^#+\s*/gm, "")
      .replace(/[ \t]+/g, " ")
      .replace(/\n{3,}/g, "\n\n")
      .replace(/^\s+|\s+$/gm, "")
      .replace(/\s*[,]+\s*$/g, "")
      .replace(/:\s*$/g, ":")
      .trim();

    const isSubstantial = stripped.length > 3 && /[a-zA-Z]/.test(stripped);

    return {
      mediaTags: completeMediaTags,
      cleanText: isSubstantial ? stripped : "",
      parsedContent: parsed,
      dataFetchIds: fetchIds,
      isReceivingTag: receivingPartialTag,
    };
  }, [lastAssistantMessage]);

  const { data: tagData, isLoading: isTagDataLoading } = useTagData(
    dataFetchIds.movieIds,
    dataFetchIds.seriesIds,
    dataFetchIds.personIds
  );

  const hasInlineTags = useMemo(() => {
    if (!parsedContent) return false;
    return parsedContent.allTags.some(
      (tag) => tag.kind === "ratings" || tag.kind === "watch" || tag.kind === "person"
    );
  }, [parsedContent]);

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      onSend();
    }
    if (e.key === "Escape") onClose();
  };

  const hasConversation = messages.length > 0;

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 10, scale: 0.98 }}
      transition={{ duration: 0.25, ease: TRANSITION_EASE }}
      className="fixed bottom-6 inset-x-0 flex flex-col items-center z-50 pointer-events-none"
    >
      {/* Bottom glow when loading */}
      <BottomGlow isActive={isLoading} />

      {!hasConversation ? (
        // Empty state - show input + quick prompts
        <GlowContainer isActive={isLoading} borderRadius={16}>
          <div
            className={cn(
              "relative px-6 py-4 rounded-2xl pointer-events-auto",
              "bg-black backdrop-blur-md",
              "border border-white/20",
              "ai-container-shadow"
            )}
          >
            <div className="w-[45vw] min-w-[300px] max-w-[550px] flex flex-col gap-3">
              {/* Featured prompt */}
              {featuredPrompt && (
                <div className="flex justify-center">
                  <button
                    onClick={() => onPromptClick(featuredPrompt.message)}
                    disabled={isLoading}
                    data-testid="ai-featured-prompt"
                    className={cn(
                      "px-4 py-2 text-sm rounded-full",
                      "bg-brand/25 hover:bg-brand/35",
                      "text-brand hover:text-brand",
                      "border border-brand/40 hover:border-brand/60",
                      "font-medium transition-all duration-200",
                      "disabled:opacity-50"
                    )}
                  >
                    {featuredPrompt.text}
                  </button>
                </div>
              )}

              {/* Quick prompts */}
              <div className="flex flex-wrap gap-2 justify-center" data-testid="ai-quick-prompts">
                {prompts
                  .filter((p) => p.text !== featuredPrompt?.text)
                  .slice(0, featuredPrompt ? 3 : 4)
                  .map((prompt, idx) => (
                    <button
                      key={prompt.text}
                      onClick={() => onPromptClick(prompt.message)}
                      disabled={isLoading}
                      data-testid={`ai-prompt-${idx}`}
                      className={cn(
                        "px-3.5 py-1.5 text-xs rounded-full",
                        "bg-white/10 hover:bg-white/20",
                        "text-white/90 hover:text-white",
                        "border border-white/15 hover:border-white/25",
                        "transition-all duration-200",
                        "disabled:opacity-50"
                      )}
                    >
                      {prompt.text}
                    </button>
                  ))}
              </div>

              {/* Input row */}
              <div className="flex items-center gap-1.5">
                <input
                  ref={inputRef}
                  type="text"
                  value={input}
                  onChange={(e) => onInputChange(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Ask about movies..."
                  disabled={isLoading}
                  data-testid="ai-chat-input"
                  className={cn(
                    "flex-1 px-4 py-2.5 text-sm rounded-full",
                    "bg-white/5 text-white placeholder:text-white/40",
                    "border border-white/15 hover:border-white/25",
                    "focus:outline-none focus:border-brand/50 focus:bg-white/10",
                    "disabled:opacity-50 transition-all duration-200"
                  )}
                />
                {!isLoading && (
                  <button
                    onClick={onSend}
                    disabled={!input.trim()}
                    data-testid="ai-send-btn"
                    className={cn(
                      "p-2.5 rounded-full",
                      "bg-brand text-brand-foreground",
                      "disabled:opacity-30 hover:bg-brand/90",
                      "transition-colors duration-200"
                    )}
                  >
                    <ArrowUp className="w-4 h-4" strokeWidth={2.5} />
                  </button>
                )}
                <button
                  onClick={onExpand}
                  data-testid="ai-expand-btn"
                  className="p-2 rounded-full text-white/50 hover:text-white hover:bg-white/10 transition-colors duration-200"
                  title="Expand"
                >
                  <Maximize2 className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={onClose}
                  data-testid="ai-close-btn"
                  className="p-2 rounded-full text-white/50 hover:text-white hover:bg-white/10 transition-colors duration-200"
                  title="Close"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        </GlowContainer>
      ) : (
        // Response content
        <GlowContainer isActive={isLoading} borderRadius={16}>
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25 }}
            className={cn(
              "rounded-2xl pointer-events-auto",
              "bg-black backdrop-blur-md",
              "border border-white/20",
              "ai-container-shadow",
              "w-[90vw] sm:w-[80vw] md:w-auto md:min-w-[550px] md:max-w-[85vw]"
            )}
          >
            {/* Poster cards section */}
            {(mediaTags.length > 0 || isReceivingTag) && (
              <div
                className={cn(
                  "flex gap-4 py-5 px-6 overflow-x-auto",
                  "scrollbar-hide border-b border-white/10"
                )}
                data-testid="ai-poster-cards"
              >
                {mediaTags.map((tag, index) => (
                  <motion.div
                    key={`${tag.type}-${tag.id ?? tag.title}-${index}`}
                    initial={{ opacity: 0, y: 30, scale: 0.9 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    transition={{
                      duration: 0.4,
                      delay: index * 0.08,
                      ease: [0.16, 1, 0.3, 1],
                    }}
                    className="shrink-0"
                  >
                    <PosterCardLarge tag={tag} />
                  </motion.div>
                ))}
                {isReceivingTag && (
                  <motion.div
                    key="loading-placeholder"
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    className="shrink-0"
                  >
                    <div
                      className="rounded-xl bg-white/5 border border-white/10 flex items-center justify-center"
                      style={{ width: CARD_WIDTH, height: CARD_HEIGHT }}
                    >
                      <ThinkingIndicator />
                    </div>
                  </motion.div>
                )}
              </div>
            )}

            {/* Text + input section */}
            <div className="px-6 py-4 flex flex-col items-center" data-testid="ai-response-container">
              <div className="w-full flex flex-col gap-3 items-center">
                {/* Response text with inline tags */}
                {lastAssistantMessage ? (
                  isWaitingForResponse ? (
                    <div className="flex items-center justify-center py-2">
                      <ThinkingIndicator />
                    </div>
                  ) : (
                    <>
                      {cleanText && (
                        <motion.p
                          className="text-sm text-white leading-relaxed text-center font-medium whitespace-pre-line"
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          transition={{ duration: 0.2 }}
                          data-testid="ai-response-text"
                        >
                          {cleanText}
                        </motion.p>
                      )}
                      {hasInlineTags && parsedContent && (
                        <div className="flex flex-wrap items-center justify-center gap-2">
                          {parsedContent.allTags.map((tag, idx) => {
                            if (tag.kind === "ratings") {
                              const data =
                                tag.mediaType === "movie"
                                  ? tagData.movies[tag.id]
                                  : tagData.series[tag.id];
                              return (
                                <ChatRatings
                                  key={`ratings-${tag.id}-${idx}`}
                                  tag={tag}
                                  data={data}
                                  isLoading={isTagDataLoading}
                                />
                              );
                            }
                            if (tag.kind === "watch") {
                              const data =
                                tag.mediaType === "movie"
                                  ? tagData.movies[tag.id]
                                  : tagData.series[tag.id];
                              return (
                                <ChatWatchOptions
                                  key={`watch-${tag.id}-${idx}`}
                                  tag={tag}
                                  data={data}
                                  isLoading={isTagDataLoading}
                                />
                              );
                            }
                            if (tag.kind === "person") {
                              const data = tag.id ? tagData.persons[tag.id] : null;
                              return (
                                <PersonChip
                                  key={`person-${tag.id ?? tag.name}-${idx}`}
                                  tag={tag}
                                  data={data}
                                  isLoading={isTagDataLoading && !!tag.id}
                                />
                              );
                            }
                            return null;
                          })}
                        </div>
                      )}
                    </>
                  )
                ) : isLoading ? (
                  <div className="flex items-center justify-center py-2">
                    <ThinkingIndicator />
                  </div>
                ) : null}

                {/* Navigation prompt */}
                {pendingNavigation && (
                  <div className="flex justify-center">
                    <button
                      onClick={onNavigate}
                      className={cn(
                        "flex items-center gap-2 px-3 py-1.5 rounded-full",
                        "bg-brand/20 hover:bg-brand/30",
                        "text-sm font-medium text-brand",
                        "border border-brand/30 transition-colors duration-200"
                      )}
                    >
                      Go to page
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}

                {/* Input row */}
                <div className="flex items-center gap-1.5 w-full max-w-[400px]">
                  <input
                    ref={inputRef}
                    type="text"
                    value={input}
                    onChange={(e) => onInputChange(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Ask something else..."
                    disabled={isLoading}
                    data-testid="ai-chat-input"
                    className={cn(
                      "flex-1 px-4 py-2.5 text-sm rounded-full",
                      "bg-white/5 text-white placeholder:text-white/40",
                      "border border-white/15 hover:border-white/25",
                      "focus:outline-none focus:border-brand/50 focus:bg-white/10",
                      "disabled:opacity-50 transition-all duration-200"
                    )}
                  />
                  {!isLoading && (
                    <button
                      onClick={onSend}
                      disabled={!input.trim()}
                      data-testid="ai-send-btn"
                      className={cn(
                        "p-2.5 rounded-full",
                        "bg-brand text-brand-foreground",
                        "disabled:opacity-30 hover:bg-brand/90",
                        "transition-colors duration-200"
                      )}
                    >
                      <ArrowUp className="w-4 h-4" strokeWidth={2.5} />
                    </button>
                  )}
                  <button
                    onClick={onExpand}
                    data-testid="ai-expand-btn"
                    className="p-2 rounded-full text-white/50 hover:text-white hover:bg-white/10 transition-colors duration-200"
                    title="Expand"
                  >
                    <Maximize2 className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={onClose}
                    data-testid="ai-close-btn"
                    className="p-2 rounded-full text-white/50 hover:text-white hover:bg-white/10 transition-colors duration-200"
                    title="Close"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        </GlowContainer>
      )}
    </motion.div>
  );
}

// =============================================================================
// Expanded Chat View
// =============================================================================

interface ExpandedChatProps {
  messages: ReturnType<typeof useChatStream>["messages"];
  isLoading: boolean;
  input: string;
  onInputChange: (value: string) => void;
  onSend: () => void;
  onCollapse: () => void;
  onClose: () => void;
  onReset: () => void;
  pendingNavigation: ReturnType<typeof useChatStream>["pendingNavigation"];
  onNavigate: () => void;
}

function ExpandedChat({
  messages,
  isLoading,
  input,
  onInputChange,
  onSend,
  onCollapse,
  onClose,
  onReset,
  pendingNavigation,
  onNavigate,
}: ExpandedChatProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      onSend();
    }
    if (e.key === "Escape") onCollapse();
  };

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const _allMediaTags = useMemo(() => {
    return collectMediaTags(messages.filter((m) => m.role === "assistant").map((m) => m.content));
  }, [messages]);

  return (
    <>
      {/* Backdrop */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40"
        onClick={onCollapse}
      />

      {/* Chat panel */}
      <motion.div
        initial={{ opacity: 0, y: 40, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 20, scale: 0.98 }}
        transition={{ duration: 0.25, ease: TRANSITION_EASE }}
        className={cn(
          "fixed bottom-6 left-1/2 -translate-x-1/2 z-50",
          "w-[calc(100vw-32px)] max-w-[600px]",
          "h-[70vh] max-h-[600px]",
          "bg-background/95 backdrop-blur-xl",
          "border border-border/50 rounded-2xl",
          "shadow-2xl shadow-black/20",
          "flex flex-col overflow-hidden"
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border/30">
          <div className="flex items-center gap-2">
            <AISparkIcon size={20} className="text-brand" />
            <span className="font-medium text-foreground">Movie Assistant</span>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={onReset}
              className="p-1.5 rounded-md hover:bg-muted/60 transition-colors"
              title="New conversation"
            >
              <RotateCcw className="w-4 h-4 text-muted-foreground" />
            </button>
            <button
              onClick={onCollapse}
              className="p-1.5 rounded-md hover:bg-muted/60 transition-colors"
              title="Minimize"
            >
              <Minimize2 className="w-4 h-4 text-muted-foreground" />
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-md hover:bg-muted/60 transition-colors"
              title="Close"
            >
              <X className="w-4 h-4 text-muted-foreground" />
            </button>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center">
              <AISparkIcon size={32} className="text-brand mb-3" />
              <p className="text-lg font-medium text-foreground">How can I help you today?</p>
              <p className="text-sm text-muted-foreground mt-1">
                Ask me for movie recommendations, search for titles, or explore trending content.
              </p>
            </div>
          ) : (
            messages.map((msg) => (
              <div
                key={msg.id}
                className={cn("flex gap-3", msg.role === "user" ? "flex-row-reverse" : "")}
              >
                <div
                  className={cn(
                    "w-8 h-8 rounded-full flex items-center justify-center shrink-0",
                    msg.role === "user"
                      ? "bg-brand text-brand-foreground"
                      : "bg-muted text-foreground"
                  )}
                >
                  {msg.role === "user" ? (
                    <span className="text-xs font-medium">You</span>
                  ) : (
                    <AISparkIcon size={16} />
                  )}
                </div>
                <div
                  className={cn(
                    "max-w-[80%] px-4 py-3 rounded-2xl",
                    msg.role === "user"
                      ? "bg-brand text-brand-foreground rounded-br-md"
                      : "bg-muted/60 text-foreground rounded-bl-md"
                  )}
                >
                  {msg.role === "assistant" ? (
                    msg.isStreaming && !msg.content ? (
                      <span className="flex items-center gap-2 py-1">
                        <ThinkingIndicator />
                      </span>
                    ) : (
                      <RichMessageContent content={msg.content} showPosterRow />
                    )
                  ) : (
                    <p className="text-sm">{msg.content}</p>
                  )}
                </div>
              </div>
            ))
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Navigation prompt */}
        {pendingNavigation && (
          <div className="px-4 pb-2">
            <button
              onClick={onNavigate}
              className={cn(
                "w-full flex items-center justify-center gap-2",
                "px-4 py-2.5 rounded-lg",
                "bg-brand/10 hover:bg-brand/20",
                "border border-brand/30",
                "text-sm font-medium text-brand",
                "transition-colors duration-200"
              )}
            >
              Go to page
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Input */}
        <div className="p-4 border-t border-border/30">
          <div className="flex items-center gap-3">
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => onInputChange(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask me anything about movies..."
              disabled={isLoading}
              className={cn(
                "flex-1 px-4 py-3 text-sm rounded-xl",
                "bg-muted/50 border border-border/30",
                "placeholder:text-muted-foreground/60",
                "focus:outline-none focus:border-brand/40",
                "disabled:opacity-50 transition-colors duration-200"
              )}
            />
            {!isLoading && (
              <button
                onClick={onSend}
                disabled={!input.trim()}
                className={cn(
                  "p-3 rounded-xl",
                  "bg-brand text-brand-foreground",
                  "disabled:opacity-50 hover:bg-brand/90",
                  "transition-colors duration-200"
                )}
              >
                <ArrowUp className="w-5 h-5" strokeWidth={2.5} />
              </button>
            )}
          </div>
        </div>
      </motion.div>
    </>
  );
}

// =============================================================================
// Main Component
// =============================================================================

interface AssistantFloatyProps {
  className?: string;
  itemContext?: {
    mediaType: "movie" | "series" | "person";
    itemId: number;
    itemTitle?: string;
  };
}

function usePageContext(itemContext?: AssistantFloatyProps["itemContext"]): PageContext | null {
  const pathname = usePathname();

  return useMemo(() => {
    if (!pathname) return null;

    const pathParts = pathname.split("/").filter(Boolean);
    const pageType = pathParts[0];

    if (itemContext) {
      return {
        path: pathname,
        mediaType: itemContext.mediaType,
        itemId: itemContext.itemId,
        itemTitle: itemContext.itemTitle,
      };
    }

    if (pageType === "movie" || pageType === "series" || pageType === "person") {
      const id = parseInt(pathParts[1], 10);
      if (!isNaN(id)) {
        return {
          path: pathname,
          mediaType: pageType as "movie" | "series" | "person",
          itemId: id,
        };
      }
    }

    return { path: pathname };
  }, [pathname, itemContext]);
}

export function AssistantFloaty({ className, itemContext }: AssistantFloatyProps) {
  const [state, setState] = useState<FloatyState>("idle");
  const [input, setInput] = useState("");
  const [showIdlePrompt, setShowIdlePrompt] = useState(false);
  const [idlePromptIndex, setIdlePromptIndex] = useState(0);
  const [featuredPrompt, setFeaturedPrompt] = useState<PromptConfig | null>(null);

  const pageContext = usePageContext(itemContext);
  const contextualPrompts = useMemo(() => getContextualPrompts(pageContext), [pageContext]);

  const { messages, isLoading, pendingNavigation, sendMessage, executeNavigation, clearMessages } =
    useChatStream({ pageContext });

  // Idle prompt cycling
  useEffect(() => {
    if (state !== "idle") return;

    const initialDelay = setTimeout(() => setShowIdlePrompt(true), 5000);

    const cycleInterval = setInterval(() => {
      setShowIdlePrompt(false);
      setTimeout(() => {
        setIdlePromptIndex((i) => (i + 1) % IDLE_PROMPTS.length);
        setShowIdlePrompt(true);
      }, 300);
    }, 10000);

    const hideInterval = setInterval(() => {
      setTimeout(() => setShowIdlePrompt(false), 4000);
    }, 10000);

    return () => {
      clearTimeout(initialDelay);
      clearInterval(cycleInterval);
      clearInterval(hideInterval);
    };
  }, [state]);

  const handleSend = useCallback(() => {
    if (!input.trim() || isLoading) return;
    sendMessage(input);
    setInput("");
  }, [input, isLoading, sendMessage]);

  const handlePromptClick = useCallback(
    (message: string) => {
      sendMessage(message);
      setState("active");
    },
    [sendMessage]
  );

  const handleClose = useCallback(() => {
    setState("idle");
    clearMessages();
    setInput("");
  }, [clearMessages]);

  const handleNavigate = useCallback(() => {
    executeNavigation();
    handleClose();
  }, [executeNavigation, handleClose]);

  const handleReset = useCallback(() => {
    clearMessages();
    setInput("");
  }, [clearMessages]);

  return (
    <AnimatePresence mode="wait">
      {state === "idle" && (
        <motion.div
          key="idle"
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.9 }}
          transition={{ duration: 0.2, ease: TRANSITION_EASE }}
          className={cn("fixed bottom-6 left-1/2 -translate-x-1/2 z-50", className)}
        >
          <IdleCircle
            onExpand={(clickedPrompt) => {
              setShowIdlePrompt(false);
              setFeaturedPrompt(clickedPrompt || null);
              setState("active");
            }}
            showPrompt={showIdlePrompt}
            prompt={IDLE_PROMPTS[idlePromptIndex]}
          />
        </motion.div>
      )}

      {state === "active" && (
        <MinimalView
          key="active"
          messages={messages}
          isLoading={isLoading}
          input={input}
          onInputChange={setInput}
          onSend={handleSend}
          onExpand={() => setState("expanded")}
          onClose={handleClose}
          prompts={contextualPrompts}
          featuredPrompt={featuredPrompt}
          onPromptClick={handlePromptClick}
          pendingNavigation={pendingNavigation}
          onNavigate={handleNavigate}
        />
      )}

      {state === "expanded" && (
        <ExpandedChat
          key="expanded"
          messages={messages}
          isLoading={isLoading}
          input={input}
          onInputChange={setInput}
          onSend={handleSend}
          onCollapse={() => setState("active")}
          onClose={handleClose}
          onReset={handleReset}
          pendingNavigation={pendingNavigation}
          onNavigate={handleNavigate}
        />
      )}
    </AnimatePresence>
  );
}
