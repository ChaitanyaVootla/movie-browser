/**
 * AI Chat API Route
 *
 * Streaming chat endpoint for the movie recommendation agent.
 * Supports both thinking (reasoning) and text content streams.
 */

import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { getUserIdForDb } from "@/lib/user-id";
import { extractNavigation, invokeAgent, getAgentResponse, resolveMediaTags } from "@/server/ai";
import { HumanMessage, AIMessage, BaseMessage } from "@langchain/core/messages";
import { apiLogger } from "@/lib/logger";

export const runtime = "nodejs";
export const maxDuration = 60; // Increased for streaming + tool calls

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface PageContext {
  path: string;
  mediaType?: "movie" | "series" | "person";
  itemId?: number;
  itemTitle?: string;
  genres?: string[];
  rating?: number;
  year?: string;
  status?: string;
}

interface ChatRequest {
  message: string;
  history?: ChatMessage[];
  stream?: boolean;
  pageContext?: PageContext;
  /** Thread ID for conversation persistence via checkpointer */
  threadId?: string;
  /** IANA timezone from client (e.g. "Asia/Kolkata") */
  timezone?: string;
}

/**
 * User context passed to the agent
 */
export interface UserContext {
  name?: string;
  region?: string;
  currentTime: string;
  timezone?: string;
}

/**
 * Convert chat history to LangChain messages
 */
function convertHistory(history: ChatMessage[]): BaseMessage[] {
  return history.map((msg) => {
    if (msg.role === "user") {
      return new HumanMessage(msg.content);
    }
    return new AIMessage(msg.content);
  });
}

/**
 * POST /api/ai/chat
 *
 * Send a message to the AI agent.
 * Uses non-streaming invoke wrapped in SSE format for reliable tool execution.
 *
 * Stream event types:
 * - thinking: Initial "Processing..." indicator
 * - text: Final response content
 * - done: Stream finished, includes final resolved message + navigation
 * - error: An error occurred
 *
 * Note: We use non-streaming invoke because some models (like Kimi K2) have
 * non-standard tool calling that breaks with true streaming. The SSE wrapper
 * provides consistent client-side handling.
 */
export async function POST(request: NextRequest) {
  try {
    // Get numeric userId (Google sub) for database queries
    const numericUserId = await getUserIdForDb();
    const userId = numericUserId?.toString() ?? null;

    // Get user session for name
    const session = await auth();

    // Get country from headers
    const headersList = await headers();
    const region = headersList.get("x-country-code") || "US";

    // Parse request body
    const body = (await request.json()) as ChatRequest;
    const { message, history = [], stream = true, pageContext } = body;

    // Build user context (needs body for timezone)
    const userContext: UserContext = {
      name: session?.user?.name || undefined,
      region,
      currentTime: new Date().toISOString(),
      timezone: body.timezone || undefined,
    };

    // Generate or reuse thread ID for checkpointer-backed conversation persistence
    const threadId = body.threadId || crypto.randomUUID();

    if (!message?.trim()) {
      return NextResponse.json({ error: "Message is required" }, { status: 400 });
    }

    // Convert history to LangChain messages (only used as fallback when no threadId from client)
    const conversationHistory = body.threadId ? [] : convertHistory(history);

    // Non-streaming response
    if (!stream) {
      const result = await invokeAgent(
        message,
        userId,
        conversationHistory,
        pageContext,
        userContext,
        threadId
      );
      let responseText = getAgentResponse(result);
      const navigation = extractNavigation(result);

      // Resolve any media tags without IDs
      responseText = await resolveMediaTags(responseText);

      return NextResponse.json({
        message: responseText,
        navigation,
        threadId,
      });
    }

    // Streaming response (SSE) - Uses non-streaming invoke for reliability with tool calls,
    // but wraps response in SSE format for consistent client handling
    const encoder = new TextEncoder();

    const readableStream = new ReadableStream({
      async start(controller) {
        try {
          // Send initial thinking indicator
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ type: "thinking", content: "Processing..." })}\n\n`
            )
          );

          // Use non-streaming invoke for reliable tool execution
          const result = await invokeAgent(
            message,
            userId,
            conversationHistory,
            pageContext,
            userContext,
            threadId
          );
          let responseText = getAgentResponse(result);
          const navigation = extractNavigation(result);

          // Resolve any media tags without IDs
          responseText = await resolveMediaTags(responseText);

          // Send the final response
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ type: "text", content: responseText })}\n\n`)
          );
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({
                type: "done",
                message: responseText,
                navigation,
                threadId,
              })}\n\n`
            )
          );
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          controller.close();
        } catch (error) {
          apiLogger.error({
            route: "/api/ai/chat",
            event: "stream_error",
            userId,
            error: error instanceof Error ? error.message : String(error),
          });
          const errorData = JSON.stringify({
            type: "error",
            error: "Something went wrong. Please try again.",
          });
          controller.enqueue(encoder.encode(`data: ${errorData}\n\n`));
          controller.close();
        }
      },
    });

    return new Response(readableStream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
      },
    });
  } catch (error) {
    apiLogger.error({
      route: "/api/ai/chat",
      event: "request_error",
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
