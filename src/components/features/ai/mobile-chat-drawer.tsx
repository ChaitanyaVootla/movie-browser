"use client";

import { useRef, useEffect, useMemo, type KeyboardEvent } from "react";
import Image from "next/image";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowUp, ArrowRight, RotateCcw, ChevronDown, Film } from "lucide-react";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { AISparkIcon } from "./ai-icon";
import { cn, getMediaPath } from "@/lib/utils";
import { CDN_IMAGE_BASE } from "@/lib/constants";
import { IS_IOS } from "@/lib/device";
import {
  parseContent,
  parseMediaTags,
  stripAllTags,
  getDataFetchIds,
  type ParsedMediaTag,
} from "@/lib/ai/parse-media-tags";
import type { useChatStream } from "@/hooks/use-chat-stream";
import { ChatRatings, ChatWatchOptions, PersonChip, useTagData } from "./chat-tags";
import { PulsingSpark } from "./ai-animations";

// =============================================================================
// Types & Config
// =============================================================================

interface PromptConfig {
  text: string;
  message: string;
}

const CARD_WIDTH = 120;
const CARD_HEIGHT = 180;

// =============================================================================
// Utilities (shared with assistant-floaty)
// =============================================================================

function extractCompleteMediaTags(content: string): ParsedMediaTag[] {
  return parseMediaTags(content);
}

function hasPartialTag(content: string): boolean {
  const partialTagRegex = /\[(MOVIE|SERIES):[^\]]*$/i;
  return partialTagRegex.test(content);
}

// =============================================================================
// Poster Card (smaller for mobile)
// =============================================================================

function MobilePosterCard({ tag, onNavigate }: { tag: ParsedMediaTag; onNavigate?: () => void }) {
  const href =
    tag.id !== null
      ? getMediaPath(tag.type, tag.id, tag.title)
      : `/browse?q=${encodeURIComponent(tag.title)}`;
  const posterUrl = tag.id !== null ? `${CDN_IMAGE_BASE}/${tag.type}/${tag.id}/poster.webp` : null;

  return (
    <Link
      href={href}
      prefetch={false}
      onClick={onNavigate}
      className="shrink-0 flex flex-col"
      style={{ width: CARD_WIDTH }}
    >
      <div
        className={cn(
          "relative overflow-hidden rounded-lg",
          "bg-neutral-900",
          "shadow-[0_4px_16px_rgba(0,0,0,0.5),0_8px_24px_rgba(0,0,0,0.4)]",
          "ring-1 ring-white/10"
        )}
        style={{ width: CARD_WIDTH, height: CARD_HEIGHT }}
      >
        {posterUrl ? (
          <Image
            src={posterUrl}
            alt={tag.title}
            width={CARD_WIDTH}
            height={CARD_HEIGHT}
            className="object-cover"
            style={{ width: CARD_WIDTH, height: CARD_HEIGHT }}
            unoptimized
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center bg-neutral-900">
            <Film className="w-8 h-8 text-white/40" />
          </div>
        )}
      </div>
      <p className="mt-1.5 text-xs font-medium text-center text-white line-clamp-2">{tag.title}</p>
    </Link>
  );
}

// =============================================================================
// Main Mobile Chat Drawer
// =============================================================================

interface MobileChatDrawerProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onClose: () => void;
  messages: ReturnType<typeof useChatStream>["messages"];
  isLoading: boolean;
  input: string;
  onInputChange: (value: string) => void;
  onSend: () => void;
  onReset: () => void;
  prompts: PromptConfig[];
  featuredPrompt: PromptConfig | null;
  onPromptClick: (message: string) => void;
  pendingNavigation: ReturnType<typeof useChatStream>["pendingNavigation"];
  onNavigate: () => void;
}

export function MobileChatDrawer({
  isOpen,
  onOpenChange,
  onClose,
  messages,
  isLoading,
  input,
  onInputChange,
  onSend,
  onReset,
  prompts,
  featuredPrompt,
  onPromptClick,
  pendingNavigation,
  onNavigate,
}: MobileChatDrawerProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

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
  };

  const hasConversation = messages.length > 0;

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, cleanText, mediaTags.length]);

  // Keyboard open/close resizes the layout viewport (Android resizes-content),
  // shrinking the drawer — keep the latest message pinned to the bottom instead
  // of letting it slide out of view behind the input.
  useEffect(() => {
    if (!isOpen) return;
    const onResize = () => messagesEndRef.current?.scrollIntoView({ block: "end" });
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [isOpen]);

  // Focus AFTER the open animation settles (focusing mid-flight made the
  // keyboard resize fight the drawer transition), and only for a fresh chat —
  // with an existing conversation the user wants to read it first, not have
  // the keyboard cover it. (Vaul's onAnimationEnd doesn't fire for an
  // externally-controlled `open` prop, so time it to its 500ms transition.)
  useEffect(() => {
    if (!isOpen || messages.length > 0) return;
    const timer = setTimeout(() => inputRef.current?.focus(), 520);
    return () => clearTimeout(timer);
  }, [isOpen, messages.length]);

  return (
    <Drawer open={isOpen} onOpenChange={onOpenChange} repositionInputs={IS_IOS}>
      {/* 92dvh tracks the keyboard via interactive-widget=resizes-content (Android);
          vaul repositionInputs (gated to iOS above) covers iOS. */}
      <DrawerContent className="bg-black border-white/10" style={{ maxHeight: "92dvh" }}>
        <DrawerHeader className="flex flex-row items-center justify-between px-4 py-3 border-b border-white/10">
          <div className="flex items-center gap-2">
            <AISparkIcon size={18} className="text-brand" />
            <DrawerTitle className="text-base font-semibold text-white">
              Cue
            </DrawerTitle>
          </div>
          <div className="flex items-center gap-1 -mr-2">
            {hasConversation && (
              <button
                onClick={onReset}
                className="p-2 rounded-full text-white/50 hover:text-white hover:bg-white/10 transition-colors"
                title="New conversation"
              >
                <RotateCcw className="w-4 h-4" />
              </button>
            )}
            <button
              onClick={onClose}
              className="p-2 rounded-full text-white/50 hover:text-white hover:bg-white/10 transition-colors"
              title="Close"
            >
              <ChevronDown className="w-5 h-5" />
            </button>
          </div>
        </DrawerHeader>

        <div className="flex-1 overflow-y-auto min-h-0">
          {!hasConversation ? (
            // Empty state - show prompts
            <div className="p-4 space-y-4">
              <p className="text-sm text-white/60 text-center">
                Ask me for recommendations, search for titles, or explore trending content.
              </p>

              {/* Featured prompt */}
              {featuredPrompt && (
                <div className="flex justify-center">
                  <button
                    onClick={() => onPromptClick(featuredPrompt.message)}
                    disabled={isLoading}
                    className={cn(
                      "px-4 py-2.5 text-sm rounded-full",
                      "bg-brand/25 hover:bg-brand/35 active:bg-brand/45",
                      "text-brand",
                      "border border-brand/40",
                      "font-medium transition-all duration-200",
                      "disabled:opacity-50"
                    )}
                  >
                    {featuredPrompt.text}
                  </button>
                </div>
              )}

              {/* Quick prompts */}
              <div className="flex flex-wrap gap-2 justify-center">
                {prompts
                  .filter((p) => p.text !== featuredPrompt?.text)
                  .slice(0, featuredPrompt ? 3 : 4)
                  .map((prompt) => (
                    <button
                      key={prompt.text}
                      onClick={() => onPromptClick(prompt.message)}
                      disabled={isLoading}
                      className={cn(
                        "flex-1 min-w-fit px-3 py-2 text-sm rounded-full",
                        "bg-white/10 hover:bg-white/20 active:bg-white/25",
                        "text-white/90",
                        "border border-white/15",
                        "transition-all duration-200",
                        "disabled:opacity-50"
                      )}
                    >
                      {prompt.text}
                    </button>
                  ))}
              </div>
            </div>
          ) : (
            // Conversation view
            <div className="p-4 space-y-4">
              {/* Poster cards horizontal scroll */}
              {(mediaTags.length > 0 || isReceivingTag) && (
                <div className="overflow-x-auto scrollbar-hide -mx-4 px-4">
                  <div className="flex gap-3 pb-2">
                    {mediaTags.map((tag, index) => (
                      <motion.div
                        key={`${tag.type}-${tag.id ?? tag.title}-${index}`}
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ duration: 0.3, delay: index * 0.05 }}
                      >
                        <MobilePosterCard tag={tag} onNavigate={onClose} />
                      </motion.div>
                    ))}
                    {isReceivingTag && (
                      <div
                        className="shrink-0 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center"
                        style={{ width: CARD_WIDTH, height: CARD_HEIGHT }}
                      >
                        <PulsingSpark size={24} />
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Response text */}
              {lastAssistantMessage ? (
                isWaitingForResponse ? (
                  <div className="flex items-center justify-center py-4">
                    <PulsingSpark size={24} />
                  </div>
                ) : (
                  <>
                    {cleanText && (
                      <motion.p
                        className="text-sm text-white leading-relaxed whitespace-pre-line"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ duration: 0.2 }}
                      >
                        {cleanText}
                      </motion.p>
                    )}
                    {hasInlineTags && parsedContent && (
                      <div className="flex flex-wrap items-center gap-2">
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
                <div className="flex items-center justify-center py-4">
                  <PulsingSpark size={24} />
                </div>
              ) : null}

              {/* Navigation prompt */}
              {pendingNavigation && (
                <button
                  onClick={onNavigate}
                  className={cn(
                    "w-full flex items-center justify-center gap-2",
                    "px-4 py-3 rounded-xl",
                    "bg-brand/20 hover:bg-brand/30 active:bg-brand/40",
                    "border border-brand/30",
                    "text-sm font-medium text-brand",
                    "transition-colors duration-200"
                  )}
                >
                  Go to page
                  <ArrowRight className="w-4 h-4" />
                </button>
              )}

              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* Input area - always visible at bottom; safe-area pad for gesture bar */}
        <div className="p-4 pb-[calc(1rem+env(safe-area-inset-bottom,0px))] border-t border-white/10 bg-black">
          <div className="flex items-center gap-2">
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => onInputChange(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={hasConversation ? "Ask Cue something else..." : "Ask Cue about movies..."}
              disabled={isLoading}
              className={cn(
                "flex-1 px-4 py-3 text-base rounded-full",
                "bg-white/5 text-white placeholder:text-white/40",
                "border border-white/15",
                "focus:outline-none focus:border-brand/50 focus:bg-white/10",
                "disabled:opacity-50 transition-all duration-200"
              )}
            />
            <AnimatePresence>
              {!isLoading && (
                <motion.button
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  exit={{ scale: 0 }}
                  onClick={onSend}
                  disabled={!input.trim()}
                  className={cn(
                    "p-3 rounded-full",
                    "bg-brand text-brand-foreground",
                    "disabled:opacity-30 active:scale-95",
                    "transition-all duration-200"
                  )}
                >
                  <ArrowUp className="w-5 h-5" strokeWidth={2.5} />
                </motion.button>
              )}
            </AnimatePresence>
          </div>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
