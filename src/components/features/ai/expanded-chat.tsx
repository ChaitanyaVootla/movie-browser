"use client";

import { useState, useEffect, useRef, useMemo, type KeyboardEvent } from "react";
import { motion } from "framer-motion";
import { X, ArrowUp, ArrowRight, Minimize2, RotateCcw } from "lucide-react";
import { AISparkIcon } from "./ai-icon";
import { cn } from "@/lib/utils";
import { useAnalytics } from "@/hooks/use-analytics";
import { RichMessageContent, collectMediaTags } from "./rich-message-content";
import { PulsingSpark } from "./ai-animations";
import { TRANSITION_EASE, type ExpandedChatProps } from "./types";

// =============================================================================
// ExpandedChat Component
// =============================================================================

export function ExpandedChat({
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
  const { trackAIChatSubmit } = useAnalytics();
  const inputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (input.trim()) trackAIChatSubmit(input);
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

  // Handle mobile virtual keyboard
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;

    const handleResize = () => {
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

  const _allMediaTags = useMemo(() => {
    return collectMediaTags(messages.filter((m) => m.role === "assistant").map((m) => m.content));
  }, [messages]);

  // Calculate bottom position and height accounting for keyboard
  const bottomPosition = keyboardHeight > 0 ? keyboardHeight + 8 : undefined;

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
          "fixed left-1/2 -translate-x-1/2 z-50",
          keyboardHeight === 0 && "bottom-20 md:bottom-6", // Above bottom nav on mobile (when no keyboard)
          keyboardHeight === 0 && "h-[70dvh] md:h-[80dvh] max-h-[800px]", // Normal height when no keyboard
          "w-[calc(100vw-32px)] max-w-[600px]",
          "bg-background/95 backdrop-blur-xl",
          "border border-border/50 rounded-2xl",
          "shadow-[0_8px_30px_rgba(0,0,0,0.5),0_16px_50px_rgba(0,0,0,0.4),0_24px_70px_rgba(0,0,0,0.3)]",
          "flex flex-col overflow-hidden"
        )}
        style={
          keyboardHeight > 0
            ? {
                bottom: bottomPosition,
                // Adjust height when keyboard is open - take available space minus some padding
                height: `calc(100dvh - ${keyboardHeight + 16}px - 60px)`, // 60px for top padding
              }
            : undefined
        }
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border/30">
          <div className="flex items-center gap-2">
            <AISparkIcon size={20} className="text-brand" />
            <span className="font-medium text-foreground">Cue</span>
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
                        <PulsingSpark size={18} />
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
              placeholder="Ask Cue anything about movies..."
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
                onClick={() => {
                  if (input.trim()) trackAIChatSubmit(input);
                  onSend();
                }}
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
