/**
 * AI Chat API Route
 *
 * Streaming chat endpoint for the movie recommendation agent.
 * Supports both thinking (reasoning) and text content streams.
 */

import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { getUserIdForDb } from "@/lib/user-id";
import { extractNavigation, invokeAgent, getAgentResponse, resolveMediaTags } from "@/server/ai";
import { checkChatRateLimit, getClientIp } from "@/server/ai/chat-rate-limit";
import { HumanMessage, AIMessage, BaseMessage } from "@langchain/core/messages";
import { apiLogger } from "@/lib/logger";

export const runtime = "nodejs";
export const maxDuration = 60; // Increased for streaming + tool calls

const ChatMessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().max(8_000),
});

type ChatMessage = z.infer<typeof ChatMessageSchema>;

const PageContextSchema = z.object({
  path: z.string().max(500),
  mediaType: z.enum(["movie", "series", "person"]).optional(),
  itemId: z.number().optional(),
  itemTitle: z.string().max(300).optional(),
  genres: z.array(z.string().max(50)).max(10).optional(),
  rating: z.number().optional(),
  year: z.string().max(10).optional(),
  status: z.string().max(50).optional(),
});

const ChatRequestSchema = z.object({
  message: z.string().min(1).max(4_000),
  history: z.array(ChatMessageSchema).max(40).optional(),
  stream: z.boolean().optional(),
  pageContext: PageContextSchema.optional(),
  /** Thread ID for conversation persistence via checkpointer */
  threadId: z.string().uuid().optional(),
  /** IANA timezone from client (e.g. "Asia/Kolkata") */
  timezone: z.string().max(64).optional(),
});

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

    // Get country from headers with GeoIP fallback
    const headersList = await headers();
    const { resolveCountry } = await import("@/lib/geoip");
    const resolvedCountry = resolveCountry(headersList);
    const region = resolvedCountry !== "unknown" ? resolvedCountry : "US";

    // Parse + validate request body
    const parsed = ChatRequestSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request", details: parsed.error.issues },
        { status: 400 }
      );
    }
    const body = parsed.data;
    const { message, history = [], stream = true, pageContext } = body;

    if (!message.trim()) {
      return NextResponse.json({ error: "Message is required" }, { status: 400 });
    }

    // Server-side rate limit — the client-side anon message limit is advisory only;
    // every invocation here costs real tokens (and possibly Tavily credits)
    const rateLimit = checkChatRateLimit({ userId, ip: getClientIp(headersList) });
    if (!rateLimit.allowed) {
      apiLogger.warn({
        route: "/api/ai/chat",
        event: "rate_limited",
        userId,
        isAuthenticated: !!userId,
      });
      return NextResponse.json(
        {
          error: userId
            ? "You're chatting faster than Cue can think — give it a minute."
            : "Cue needs a breather. Sign in for a higher chat limit, or try again shortly.",
          reason: "rate_limited",
          retryAfterSeconds: rateLimit.retryAfterSeconds,
        },
        { status: 429, headers: { "Retry-After": String(rateLimit.retryAfterSeconds ?? 60) } }
      );
    }

    // Build user context (needs body for timezone)
    const userContext: UserContext = {
      name: session?.user?.name || undefined,
      region,
      currentTime: new Date().toISOString(),
      timezone: body.timezone || undefined,
    };

    // Generate or reuse thread ID for checkpointer-backed conversation persistence
    const threadId = body.threadId || crypto.randomUUID();

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
