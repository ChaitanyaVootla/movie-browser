"use client";

import { useState, useEffect, useRef, useMemo, type KeyboardEvent } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, ArrowUp, ArrowRight, Maximize2, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  parseContent,
  parseMediaTags,
  stripAllTags,
  getDataFetchIds,
  type ParsedMediaTag,
} from "@/lib/ai/parse-media-tags";
import { ChatRatings, ChatWatchOptions, PersonChip, useTagData } from "./chat-tags";
import { GlowContainer, ThinkingIndicator, BottomGlow } from "./ai-animations";
import { PosterCardLarge } from "./poster-card-large";
import { CARD_WIDTH, CARD_HEIGHT, TRANSITION_EASE, type MinimalViewProps } from "./types";

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
// MinimalView Component
// =============================================================================

export function MinimalView({
  messages,
  isLoading,
  input,
  onInputChange,
  onSend,
  onExpand,
  onMinimize,
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

  const isWaitingForResponse = lastAssistantMessage?.isStreaming && !lastAssistantMessage?.content;

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
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Handle mobile virtual keyboard - adjust position when keyboard opens
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;

    const handleResize = () => {
      // On mobile, when keyboard opens, visualViewport.height shrinks
      // Calculate the keyboard height as the difference
      const viewportHeight = viewport.height;
      const windowHeight = window.innerHeight;
      const keyboardH = windowHeight - viewportHeight - viewport.offsetTop;
      setKeyboardHeight(Math.max(0, keyboardH));
    };

    viewport.addEventListener("resize", handleResize);
    viewport.addEventListener("scroll", handleResize);

    return () => {
      viewport.removeEventListener("resize", handleResize);
      viewport.removeEventListener("scroll", handleResize);
    };
  }, []);

  // Calculate bottom position accounting for keyboard
  const bottomPosition =
    keyboardHeight > 0
      ? keyboardHeight + 8 // 8px above keyboard
      : undefined; // Use CSS default

  return (
    <motion.div
      initial={{ opacity: 0, y: 20, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 10, scale: 0.98 }}
      transition={{ duration: 0.25, ease: TRANSITION_EASE }}
      className={cn(
        "fixed inset-x-0 flex flex-col items-center z-50 pointer-events-none",
        keyboardHeight === 0 && "bottom-20 md:bottom-6" // Above bottom nav on mobile (when no keyboard)
      )}
      style={bottomPosition ? { bottom: bottomPosition } : undefined}
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
                  onClick={onMinimize}
                  data-testid="ai-minimize-btn"
                  className="p-2 rounded-full text-white/50 hover:text-white hover:bg-white/10 transition-colors duration-200"
                  title="Minimize"
                >
                  <ChevronDown className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        </GlowContainer>
      ) : (
        // Response content - two separate containers
        <div className="flex flex-col items-center gap-3 pointer-events-none">
          {/* Poster cards container - sizes to fit cards */}
          {(mediaTags.length > 0 || isReceivingTag) && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25 }}
              className={cn(
                "rounded-2xl pointer-events-auto",
                "bg-black backdrop-blur-md",
                "border border-white/20",
                "shadow-lg shadow-black/60",
                "overflow-x-auto scrollbar-hide",
                "max-w-[90vw]"
              )}
              data-testid="ai-poster-cards"
            >
              <div className="flex gap-4 py-5 px-6">
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
            </motion.div>
          )}

          {/* Text + input container - independent width */}
          <GlowContainer isActive={isLoading} borderRadius={16}>
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25, delay: mediaTags.length > 0 ? 0.1 : 0 }}
              className={cn(
                "rounded-2xl pointer-events-auto",
                "bg-black backdrop-blur-md",
                "border border-white/20",
                "ai-container-shadow",
                "w-[90vw] sm:w-auto sm:min-w-[400px]"
              )}
            >
              <div
                className="px-6 py-4 flex flex-col items-center"
                data-testid="ai-response-container"
              >
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
                  <div className="flex items-center gap-1.5 w-full">
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
                      onClick={onMinimize}
                      data-testid="ai-minimize-btn"
                      className="p-2 rounded-full text-white/50 hover:text-white hover:bg-white/10 transition-colors duration-200"
                      title="Minimize"
                    >
                      <ChevronDown className="w-4 h-4" />
                    </button>
                    <button
                      onClick={onClose}
                      data-testid="ai-close-btn"
                      className="p-2 rounded-full text-white/50 hover:text-white hover:bg-white/10 transition-colors duration-200"
                      title="Close & reset"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          </GlowContainer>
        </div>
      )}
    </motion.div>
  );
}
