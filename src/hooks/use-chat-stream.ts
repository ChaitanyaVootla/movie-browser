"use client";

import { useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";

// =============================================================================
// Types
// =============================================================================

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  /** Thinking/reasoning content from the model (for display) */
  thinking?: string;
  isStreaming?: boolean;
  /** Whether we're currently receiving thinking content */
  isThinking?: boolean;
  toolCalls?: string[];
}

export interface PageContext {
  path: string;
  mediaType?: "movie" | "series" | "person";
  itemId?: number;
  itemTitle?: string;
}

interface StreamEvent {
  type: "thinking" | "text" | "tool_call" | "tool_result" | "done" | "error";
  content?: string;
  tool?: string;
  message?: string;
  thinking?: string;
  navigation?: {
    path: string;
    id?: number;
    type?: string;
  };
  error?: string;
}

// =============================================================================
// Helpers
// =============================================================================

/**
 * Remove thinking/reasoning tags and internal tool markers from model output
 * Some models output chain-of-thought in XML-like tags that shouldn't be shown to users
 * Also filters LangGraph/Bedrock tool call markers
 */
function filterInternalTags(content: string): string {
  return content
    // Remove thinking tags
    .replace(/<thinking>[\s\S]*?<\/thinking>/gi, "")
    .replace(/<thought>[\s\S]*?<\/thought>/gi, "")
    .replace(/<reasoning>[\s\S]*?<\/reasoning>/gi, "")
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    // Remove tool call markers (LangGraph/Bedrock XML format)
    .replace(/<tool_call_begin>[\s\S]*?<tool_call_end>/gi, "")
    .replace(/<tool_calls_section_begin>[\s\S]*?<tool_calls_section_end>/gi, "")
    .replace(/<tool_call_argument_begin>[\s\S]*?<tool_call_argument_end>/gi, "")
    // Remove Kimi K2 / Moonshot format tool markers (pipe delimited)
    .replace(/<\|tool_call_begin\|>[\s\S]*?<\|tool_call_end\|>/gi, "")
    .replace(/<\|tool_call_argument_begin\|>[\s\S]*?<\|tool_call_argument_end\|>/gi, "")
    // Remove function call markers
    .replace(/<functions\.[\w]+>[\s\S]*?<\/functions\.[\w]+>/gi, "")
    .replace(/functions\.[\w]+:\d+/gi, "")
    // Handle unclosed tags (streaming partial content)
    .replace(/<thinking>[\s\S]*$/gi, "")
    .replace(/<thought>[\s\S]*$/gi, "")
    .replace(/<reasoning>[\s\S]*$/gi, "")
    .replace(/<think>[\s\S]*$/gi, "")
    .replace(/<tool_call_begin>[\s\S]*$/gi, "")
    .replace(/<tool_calls_section_begin>[\s\S]*$/gi, "")
    .replace(/<tool_call_argument_begin>[\s\S]*$/gi, "")
    .replace(/<functions\.[\w]+>[\s\S]*$/gi, "")
    // Handle unclosed Kimi K2 format markers
    .replace(/<\|tool_call_begin\|>[\s\S]*$/gi, "")
    .replace(/<\|tool_call_argument_begin\|>[\s\S]*$/gi, "")
    // Clean up any standalone closing tags that might be left
    .replace(/<tool_call_end>/gi, "")
    .replace(/<tool_calls_section_end>/gi, "")
    .replace(/<tool_call_argument_end>/gi, "")
    .replace(/<\/functions\.[\w]+>/gi, "")
    .replace(/<\|tool_call_end\|>/gi, "")
    .replace(/<\|tool_call_argument_end\|>/gi, "")
    // Clean up any leftover angle bracket/pipe artifacts
    .replace(/<\|[^|]*\|>/gi, "")
    // Clean up extra whitespace from removals
    .replace(/\s{2,}/g, " ")
    .trim();
}

// =============================================================================
// Hook
// =============================================================================

interface UseChatStreamOptions {
  /** Page context for contextual recommendations */
  pageContext?: PageContext | null;
}

/**
 * Hook for streaming chat with the AI agent
 */
export function useChatStream(options: UseChatStreamOptions = {}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [activeTools, setActiveTools] = useState<string[]>([]);
  const [pendingNavigation, setPendingNavigation] = useState<StreamEvent["navigation"] | null>(null);
  const router = useRouter();
  const abortControllerRef = useRef<AbortController | null>(null);
  const messageIdRef = useRef(0);
  
  // Store page context in ref so it can be updated without re-creating sendMessage
  const pageContextRef = useRef<PageContext | null>(options.pageContext ?? null);
  pageContextRef.current = options.pageContext ?? null;

  /**
   * Generate unique message ID
   */
  const generateId = useCallback(() => {
    messageIdRef.current += 1;
    return `msg-${messageIdRef.current}-${Date.now()}`;
  }, []);

  /**
   * Send a message and stream the response
   */
  const sendMessage = useCallback(
    async (content: string) => {
      if (!content.trim() || isLoading) return;

      // Abort any existing request
      abortControllerRef.current?.abort();
      abortControllerRef.current = new AbortController();

      // Add user message
      const userMessage: ChatMessage = {
        id: generateId(),
        role: "user",
        content: content.trim(),
      };

      setMessages((prev) => [...prev, userMessage]);
      setIsLoading(true);
      setActiveTools([]);
      setPendingNavigation(null);

      // Prepare assistant message placeholder
      const assistantId = generateId();
      setMessages((prev) => [
        ...prev,
        {
          id: assistantId,
          role: "assistant",
          content: "",
          thinking: "",
          isStreaming: true,
          isThinking: true, // Start with thinking state
          toolCalls: [],
        },
      ]);

      try {
        // Build history for context (excluding the streaming message we just added)
        const history = messages.map((msg) => ({
          role: msg.role,
          content: msg.content,
        }));

        const response = await fetch("/api/ai/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: content.trim(),
            history,
            stream: true,
            pageContext: pageContextRef.current,
          }),
          signal: abortControllerRef.current.signal,
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const reader = response.body?.getReader();
        if (!reader) {
          throw new Error("No response body");
        }

        const decoder = new TextDecoder();
        let buffer = "";
        let assistantThinking = "";
        let assistantContent = "";
        const toolCalls: string[] = [];

        // Process the stream
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;

            const data = line.slice(6).trim();
            if (data === "[DONE]") continue;

            try {
              const event: StreamEvent = JSON.parse(data);

              switch (event.type) {
                case "thinking":
                  // Stream thinking/reasoning content
                  if (event.content) {
                    assistantThinking += event.content;
                    setMessages((prev) =>
                      prev.map((msg) =>
                        msg.id === assistantId
                          ? { ...msg, thinking: assistantThinking, isThinking: true }
                          : msg
                      )
                    );
                  }
                  break;

                case "text":
                  // Stream actual text content
                  if (event.content) {
                    assistantContent += event.content;
                    // Filter out any internal tags for display
                    const displayContent = filterInternalTags(assistantContent);
                    setMessages((prev) =>
                      prev.map((msg) =>
                        msg.id === assistantId
                          ? { ...msg, content: displayContent, isThinking: false }
                          : msg
                      )
                    );
                  }
                  break;

                case "tool_call":
                  if (event.tool) {
                    toolCalls.push(event.tool);
                    setActiveTools((prev) => [...prev, event.tool!]);
                    setMessages((prev) =>
                      prev.map((msg) =>
                        msg.id === assistantId
                          ? { ...msg, toolCalls: [...toolCalls], isThinking: false }
                          : msg
                      )
                    );
                  }
                  break;

                case "tool_result":
                  if (event.tool) {
                    setActiveTools((prev) => prev.filter((t) => t !== event.tool));
                  }
                  break;

                case "done":
                  // Finalize the message with resolved content from server
                  const finalContent = filterInternalTags(event.message || assistantContent);
                  setMessages((prev) =>
                    prev.map((msg) =>
                      msg.id === assistantId
                        ? {
                            ...msg,
                            content: finalContent,
                            thinking: event.thinking || assistantThinking,
                            isStreaming: false,
                            isThinking: false,
                            toolCalls,
                          }
                        : msg
                    )
                  );

                  // Handle navigation
                  if (event.navigation) {
                    setPendingNavigation(event.navigation);
                  }
                  break;

                case "error":
                  setMessages((prev) =>
                    prev.map((msg) =>
                      msg.id === assistantId
                        ? {
                            ...msg,
                            content: event.error || "Something went wrong. Please try again.",
                            isStreaming: false,
                            isThinking: false,
                          }
                        : msg
                    )
                  );
                  break;
              }
            } catch {
              // Ignore JSON parse errors
            }
          }
        }
      } catch (error) {
        if ((error as Error).name === "AbortError") {
          // Request was aborted, clean up the streaming message
          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === assistantId
                ? { ...msg, content: msg.content || "Cancelled", isStreaming: false, isThinking: false }
                : msg
            )
          );
        } else {
          console.error("Chat stream error:", error);
          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === assistantId
                ? {
                    ...msg,
                    content: "Sorry, something went wrong. Please try again.",
                    isStreaming: false,
                    isThinking: false,
                  }
                : msg
            )
          );
        }
      } finally {
        setIsLoading(false);
        setActiveTools([]);
      }
    },
    [isLoading, messages, generateId]
  );

  /**
   * Execute pending navigation
   */
  const executeNavigation = useCallback(() => {
    if (pendingNavigation) {
      router.push(pendingNavigation.path);
      setPendingNavigation(null);
    }
  }, [pendingNavigation, router]);

  /**
   * Clear all messages and reset state
   */
  const clearMessages = useCallback(() => {
    abortControllerRef.current?.abort();
    setMessages([]);
    setIsLoading(false);
    setActiveTools([]);
    setPendingNavigation(null);
  }, []);

  /**
   * Stop the current stream
   */
  const stopStream = useCallback(() => {
    abortControllerRef.current?.abort();
  }, []);

  return {
    messages,
    isLoading,
    activeTools,
    pendingNavigation,
    sendMessage,
    executeNavigation,
    clearMessages,
    stopStream,
  };
}

