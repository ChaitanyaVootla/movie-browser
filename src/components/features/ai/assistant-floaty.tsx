"use client";

import { useState, useCallback, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { useSession } from "next-auth/react";
import { useChatStream } from "@/hooks/use-chat-stream";
import { useMobile } from "@/hooks/use-mobile";
import { useMediaContextState } from "@/stores/media-context";
import { useLoginDialog, LoginDialog } from "@/components/features/auth/login-dialog";
import { MobileChatDrawer } from "./mobile-chat-drawer";
import { WakeUpBorder } from "./ai-animations";

// Import extracted components and types
import { IdleCircle } from "./idle-circle";
import { MinimalView } from "./minimal-view";
import { ExpandedChat } from "./expanded-chat";
import { getContextualPrompts, IDLE_PROMPTS } from "./prompts";
import { type FloatyState, type PromptConfig, type PostWatchContext, TRANSITION_EASE } from "./types";

// =============================================================================
// Main Component
// =============================================================================

export function AssistantFloaty({ className }: { className?: string }) {
  const [state, setState] = useState<FloatyState>("idle");
  const [input, setInput] = useState("");
  const [showIdlePrompt, setShowIdlePrompt] = useState(false);
  const [idlePromptIndex, setIdlePromptIndex] = useState(0);
  const [featuredPrompt, setFeaturedPrompt] = useState<PromptConfig | null>(null);
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);
  const [postWatch, setPostWatch] = useState<PostWatchContext | null>(null);
  const [showWakeUpBorder, setShowWakeUpBorder] = useState(false);

  const isMobile = useMobile();
  const pathname = usePathname();
  const { status } = useSession();
  const isAuthenticated = status === "authenticated";
  const mediaContext = useMediaContextState();
  const { isOpen: loginOpen, message: loginMessage, openLoginDialog, setIsOpen: setLoginOpen } = useLoginDialog();

  // Generate contextual prompts based on page and media context
  const contextualPrompts = useMemo(
    () => getContextualPrompts(pathname, mediaContext),
    [pathname, mediaContext]
  );

  // Build page context for chat stream (for AI agent context)
  // Includes media metadata so the agent has context without needing a tool call
  const pageContext = useMemo(() => {
    if (!pathname) return null;
    return {
      path: pathname,
      mediaType: mediaContext.mediaType || undefined,
      itemId: mediaContext.itemId || undefined,
      itemTitle: mediaContext.title || undefined,
      genres: mediaContext.genres || undefined,
      rating: mediaContext.rating || undefined,
      year: mediaContext.year || undefined,
      status: mediaContext.status || undefined,
    };
  }, [pathname, mediaContext]);

  const { messages, isLoading, pendingNavigation, requiresLogin, sendMessage, executeNavigation, clearMessages } =
    useChatStream({ pageContext, isAuthenticated });

  // Listen for external chat trigger events (from AIQuestionsSection)
  useEffect(() => {
    const handleChatTrigger = (event: CustomEvent<{ message: string }>) => {
      const { message } = event.detail;
      if (message) {
        sendMessage(message);
        setState("active");
      }
    };

    window.addEventListener("ai-chat-trigger", handleChatTrigger as EventListener);
    return () => {
      window.removeEventListener("ai-chat-trigger", handleChatTrigger as EventListener);
    };
  }, [sendMessage]);

  // Show login dialog when anonymous message limit is hit
  useEffect(() => {
    if (requiresLogin) {
      openLoginDialog("Sign in to keep chatting with Cue");
    }
  }, [requiresLogin, openLoginDialog]);

  // Listen for post-watch engagement events
  useEffect(() => {
    const handlePostWatch = (
      event: CustomEvent<{ tmdbId: number; mediaType: "movie" | "series"; title: string }>
    ) => {
      const { tmdbId, mediaType: mType, title: mTitle } = event.detail;
      // Only trigger when agent is idle and not already in post-watch
      if (state !== "idle" || postWatch) return;

      // Use post-watch questions from media context, fall back to generic prompts
      const questions = mediaContext.postWatchQuestions?.length
        ? mediaContext.postWatchQuestions
        : [
            `What did you think of ${mTitle}?`,
            `What themes stood out in ${mTitle}?`,
            `Would you recommend ${mTitle}?`,
          ];

      const trivia = mediaContext.trivia ?? [];

      // Play the cascading border animation first
      setShowWakeUpBorder(true);
      // After cascade reaches bottom, show the post-watch bubble
      setTimeout(() => {
        setShowIdlePrompt(false);
        setPostWatch({ title: mTitle, tmdbId, mediaType: mType, questions, trivia });
      }, 700);

};

    window.addEventListener("ai-post-watch", handlePostWatch as EventListener);
    return () => {
      window.removeEventListener("ai-post-watch", handlePostWatch as EventListener);
    };
  }, [state, postWatch, mediaContext.postWatchQuestions]);

  // Reset prompt index when prompts change (e.g., navigating to different page)
  const promptCount = contextualPrompts.length || IDLE_PROMPTS.length;
  useEffect(() => {
    // Defer state update to avoid cascading renders
    const timer = setTimeout(() => setIdlePromptIndex(0), 0);
    return () => clearTimeout(timer);
  }, [promptCount]);

  // Idle prompt cycling - uses contextual prompts (page-aware)
  useEffect(() => {
    if (state !== "idle") return;

    const initialDelay = setTimeout(() => setShowIdlePrompt(true), 5000);

    const cycleInterval = setInterval(() => {
      setShowIdlePrompt(false);
      setTimeout(() => {
        setIdlePromptIndex((i) => (i + 1) % promptCount);
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
  }, [state, promptCount]);

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

  const handlePostWatchQuestion = useCallback(
    (message: string) => {
      setPostWatch(null);
      setShowWakeUpBorder(false);
      sendMessage(message);
      setState("active");
    },
    [sendMessage]
  );

  const handlePostWatchDismiss = useCallback(() => {
    setPostWatch(null);
    setShowWakeUpBorder(false);
  }, []);

  const handleMinimize = useCallback(() => {
    setState("idle");
    // Don't clear messages - preserve the conversation
  }, []);

  const handleClose = useCallback(() => {
    setState("idle");
    clearMessages();
    setInput("");
  }, [clearMessages]);

  const handleNavigate = useCallback(() => {
    executeNavigation();
    handleMinimize(); // Minimize instead of close to preserve context
  }, [executeNavigation, handleMinimize]);

  const handleReset = useCallback(() => {
    clearMessages();
    setInput("");
  }, [clearMessages]);

  // Handle mobile drawer open/close
  const handleMobileExpand = useCallback(
    (clickedPrompt?: PromptConfig) => {
      setShowIdlePrompt(false);
      if (messages.length === 0) {
        setFeaturedPrompt(clickedPrompt || null);
      }
      setMobileDrawerOpen(true);
    },
    [messages.length]
  );

  const handleMobileDrawerChange = useCallback((open: boolean) => {
    setMobileDrawerOpen(open);
    // Don't clear messages when closing - preserve conversation
  }, []);

  const handleMobileNavigate = useCallback(() => {
    executeNavigation();
    setMobileDrawerOpen(false);
  }, [executeNavigation]);

  // Mobile: Use drawer
  if (isMobile) {
    return (
      <>
        {/* Wake-up border animation (post-watch engagement) */}
        <WakeUpBorder
          isActive={showWakeUpBorder}
          onComplete={() => setShowWakeUpBorder(false)}
        />

        {/* Idle bubble - always visible when drawer is closed */}
        <AnimatePresence>
          {!mobileDrawerOpen && (
            <motion.div
              key="idle-mobile"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              transition={{ duration: 0.2, ease: TRANSITION_EASE }}
              className={cn(
                "fixed left-1/2 -translate-x-1/2 z-50",
                "bottom-[4.25rem]", // Above the h-14 (56px) bottom nav + some margin
                className
              )}
            >
              <IdleCircle
                onExpand={handleMobileExpand}
                showPrompt={showIdlePrompt}
                prompt={contextualPrompts[idlePromptIndex % contextualPrompts.length] || IDLE_PROMPTS[0]}
                hasActiveConversation={messages.length > 0}
                postWatch={postWatch}
                onPostWatchQuestion={handlePostWatchQuestion}
                onPostWatchDismiss={handlePostWatchDismiss}
              />
            </motion.div>
          )}
        </AnimatePresence>

        {/* Mobile drawer */}
        <MobileChatDrawer
          isOpen={mobileDrawerOpen}
          onOpenChange={handleMobileDrawerChange}
          onClose={() => setMobileDrawerOpen(false)}
          messages={messages}
          isLoading={isLoading}
          input={input}
          onInputChange={setInput}
          onSend={handleSend}
          onReset={handleReset}
          prompts={contextualPrompts}
          featuredPrompt={featuredPrompt}
          onPromptClick={handlePromptClick}
          pendingNavigation={pendingNavigation}
          onNavigate={handleMobileNavigate}
        />

        <LoginDialog open={loginOpen} onOpenChange={setLoginOpen} message={loginMessage} />
      </>
    );
  }

  // Desktop: Use floating UI
  return (
    <>
      {/* Wake-up border animation (post-watch engagement) */}
      <WakeUpBorder
        isActive={showWakeUpBorder}
        onComplete={() => setShowWakeUpBorder(false)}
      />

      <AnimatePresence mode="wait">
        {/* Idle state */}
        {state === "idle" && (
          <motion.div
            key="idle"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            transition={{ duration: 0.2, ease: TRANSITION_EASE }}
            className={cn("fixed left-1/2 -translate-x-1/2 z-50 bottom-6", className)}
          >
            <IdleCircle
              onExpand={(clickedPrompt) => {
                setShowIdlePrompt(false);
                setPostWatch(null);
                // Only set featured prompt if no active conversation
                if (messages.length === 0) {
                  setFeaturedPrompt(clickedPrompt || null);
                }
                setState("active");
              }}
              showPrompt={showIdlePrompt}
              prompt={contextualPrompts[idlePromptIndex % contextualPrompts.length] || IDLE_PROMPTS[0]}
              hasActiveConversation={messages.length > 0}
              postWatch={postWatch}
              onPostWatchQuestion={handlePostWatchQuestion}
              onPostWatchDismiss={handlePostWatchDismiss}
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
          onMinimize={handleMinimize}
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

      <LoginDialog open={loginOpen} onOpenChange={setLoginOpen} message={loginMessage} />
    </>
  );
}
