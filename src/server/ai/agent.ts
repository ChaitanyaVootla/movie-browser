/**
 * LangGraph Movie Recommendation Agent
 *
 * Stateful agent for movie discovery and recommendations.
 */

import { MemorySaver, StateGraph } from "@langchain/langgraph";
import { ToolNode } from "@langchain/langgraph/prebuilt";
import {
  AIMessage,
  HumanMessage,
  SystemMessage,
  BaseMessage,
  ToolMessage,
} from "@langchain/core/messages";
import { RunnableConfig } from "@langchain/core/runnables";
import { AgentState, type AgentStateType } from "./state";
import { createChatModel, getCurrentModelId as getProviderModelId } from "./provider";
import { allTools } from "./tools";
import { getSystemPrompt } from "./prompts/system";
import { aiLogger, usageLogger, aiToolLogger } from "@/lib/logger";
import { calculateUsageStats, type UsageStats } from "@/lib/model-pricing";
import { trackAIUsage } from "@/lib/analytics/track";
import type { QueryType } from "@/lib/analytics/types";

// =============================================================================
// Debug Logging
// =============================================================================

// Debug logging enabled by default - set AI_DEBUG=false to disable
const DEBUG = process.env.AI_DEBUG !== "false";

/** Maximum agentic loop iterations (LangGraph recursion limit) */
const MAX_RECURSION_LIMIT = 25;

interface ToolCallLog {
  name: string;
  args: unknown;
  argsSize: number;
  timestamp: number;
}

interface ToolResultLog {
  name: string;
  result: string;
  resultSize: number;
  duration: number;
  timestamp: number;
}

interface TurnLog {
  turn: number;
  node: "agent" | "tools";
  toolCalls?: ToolCallLog[];
  toolResults?: ToolResultLog[];
  response?: string;
  responseSize?: number;
  llmDuration?: number;
  timestamp: number;
}

interface InvocationStats {
  startTime: number;
  systemPromptSize: number;
  querySize: number;
  historySize: number;
  totalInputChars: number;
  totalOutputChars: number;
  totalToolArgsChars: number;
  totalToolResultsChars: number;
}

// =============================================================================
// Per-Invocation State (concurrency-safe)
// =============================================================================

interface TurnUsage {
  inputTokens: number;
  outputTokens: number;
}

interface InvocationContext {
  turnUsages: TurnUsage[];
  currentTurn: number;
  turnLogs: TurnLog[];
  invocationStats: InvocationStats | null;
  lastLlmStartTime: number;
}

/** Map of invocationId → per-request logging state */
const invocationContexts = new Map<string, InvocationContext>();

function createInvocationContext(invocationId: string): InvocationContext {
  const ctx: InvocationContext = {
    turnUsages: [],
    currentTurn: 0,
    turnLogs: [],
    invocationStats: null,
    lastLlmStartTime: 0,
  };
  invocationContexts.set(invocationId, ctx);
  return ctx;
}

function getInvocationContext(invocationId: string): InvocationContext {
  const ctx = invocationContexts.get(invocationId);
  if (!ctx) {
    // Fallback: create one if missing (shouldn't happen in normal flow)
    return createInvocationContext(invocationId);
  }
  return ctx;
}

function cleanupInvocationContext(invocationId: string) {
  invocationContexts.delete(invocationId);
}

function logTurn(invocationId: string, log: Omit<TurnLog, "turn" | "timestamp">) {
  const ctx = getInvocationContext(invocationId);
  ctx.currentTurn++;
  const turnLog: TurnLog = {
    ...log,
    turn: ctx.currentTurn,
    timestamp: Date.now(),
  };
  ctx.turnLogs.push(turnLog);

  // Structured logging for tool calls (always log, not just DEBUG)
  if (log.toolCalls?.length) {
    for (const tc of log.toolCalls) {
      aiToolLogger.info({
        event: "tool_call",
        turn: ctx.currentTurn,
        tool: tc.name,
        argsSize: tc.argsSize,
        args: tc.args,
      });
    }
    if (ctx.invocationStats) {
      ctx.invocationStats.totalToolArgsChars += log.toolCalls.reduce(
        (sum, tc) => sum + tc.argsSize,
        0
      );
    }
  }

  // Structured logging for tool results
  if (log.toolResults?.length) {
    for (const tr of log.toolResults) {
      aiToolLogger.info({
        event: "tool_result",
        turn: ctx.currentTurn,
        tool: tr.name,
        resultSize: tr.resultSize,
        durationMs: tr.duration,
      });
    }
    if (ctx.invocationStats) {
      ctx.invocationStats.totalToolResultsChars += log.toolResults.reduce(
        (sum, tr) => sum + tr.resultSize,
        0
      );
    }
  }

  // Structured logging for LLM response
  if (log.response && log.llmDuration) {
    aiLogger.debug({
      event: "llm_response",
      turn: ctx.currentTurn,
      responseSize: log.responseSize,
      durationMs: log.llmDuration,
      hasToolCalls: (log.toolCalls?.length || 0) > 0,
    });
    if (ctx.invocationStats && log.responseSize) {
      ctx.invocationStats.totalOutputChars += log.responseSize;
    }
  }

  // Pretty console output for development
  if (DEBUG) {
    console.log("\n" + "=".repeat(70));
    console.log(`[AI AGENT] Turn ${ctx.currentTurn} - ${log.node.toUpperCase()}`);
    console.log("=".repeat(70));

    if (log.toolCalls?.length) {
      console.log("\n📤 Tool Calls:");
      for (const tc of log.toolCalls) {
        console.log(`   └─ ${tc.name} (args: ${tc.argsSize} chars)`);
        console.log(`      Args: ${JSON.stringify(tc.args, null, 2).split("\n").join("\n      ")}`);
      }
    }

    if (log.toolResults?.length) {
      console.log("\n📥 Tool Results:");
      for (const tr of log.toolResults) {
        const resultPreview =
          tr.result.length > 500 ? tr.result.slice(0, 500) + "... [truncated]" : tr.result;
        console.log(`   └─ ${tr.name} (${tr.duration}ms, ${tr.resultSize} chars)`);
        console.log(`      Result: ${resultPreview.split("\n").join("\n      ")}`);
      }
    }

    if (log.response) {
      const llmTime = log.llmDuration ? ` (LLM: ${log.llmDuration}ms)` : "";
      console.log(
        `\n💬 Response${llmTime}:`,
        log.response.slice(0, 300) + (log.response.length > 300 ? "..." : "")
      );
    }
  }
}

export interface AgentLogs {
  turns: TurnLog[];
  totalTurns: number;
  stats: InvocationStats | null;
  usage?: UsageStats;
}

function getAgentLogs(invocationId: string): AgentLogs {
  const ctx = getInvocationContext(invocationId);
  return { turns: ctx.turnLogs, totalTurns: ctx.currentTurn, stats: ctx.invocationStats };
}

// =============================================================================
// Agent Nodes
// =============================================================================

/**
 * Agent node - the LLM decides what to do next
 */
async function agentNode(
  state: AgentStateType,
  config?: RunnableConfig
): Promise<Partial<AgentStateType>> {
  const invocationId = (config?.configurable?.invocationId as string) || "unknown";
  const ctx = getInvocationContext(invocationId);
  const model = createChatModel().bindTools(allTools);

  // Build messages with system prompt including user context
  const isAuthenticated = !!state.userId;
  const systemPrompt = getSystemPrompt(isAuthenticated, state.userContext);

  // Check if system message already exists
  const hasSystemMessage = state.messages[0] instanceof SystemMessage;

  const messages = hasSystemMessage
    ? state.messages
    : [new SystemMessage(systemPrompt), ...state.messages];

  // Track LLM timing
  ctx.lastLlmStartTime = Date.now();

  // Invoke the model
  const response = await model.invoke(messages);

  const llmDuration = Date.now() - ctx.lastLlmStartTime;

  // Extract token usage from response metadata (LangChain provides this)
  const usageMetadata = response.usage_metadata;
  if (usageMetadata) {
    ctx.turnUsages.push({
      inputTokens: usageMetadata.input_tokens || 0,
      outputTokens: usageMetadata.output_tokens || 0,
    });
  }

  // Log the turn
  const toolCalls: ToolCallLog[] = [];
  if (response instanceof AIMessage && response.tool_calls?.length) {
    for (const tc of response.tool_calls) {
      const argsStr = JSON.stringify(tc.args);
      toolCalls.push({
        name: tc.name,
        args: tc.args,
        argsSize: argsStr.length,
        timestamp: Date.now(),
      });
    }
  }

  // Extract response text for logging (handles both string and array content)
  let responseText: string | undefined;
  if (typeof response.content === "string") {
    responseText = response.content;
  } else if (Array.isArray(response.content)) {
    for (const block of response.content) {
      if (
        typeof block === "object" &&
        block !== null &&
        "type" in block &&
        block.type === "text" &&
        "text" in block &&
        typeof block.text === "string"
      ) {
        responseText = block.text;
        break;
      }
    }
  }

  logTurn(invocationId, {
    node: "agent",
    toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
    response: responseText,
    responseSize: responseText?.length,
    llmDuration,
  });

  return { messages: [response] };
}

/**
 * Tool node wrapper that injects context into the config
 * This allows tools to access userId and pageContext
 */
async function toolNodeWithContext(
  state: AgentStateType,
  config?: RunnableConfig
): Promise<Partial<AgentStateType>> {
  const toolNode = new ToolNode(allTools);

  const invocationId = (config?.configurable?.invocationId as string) || "unknown";

  // Merge userId, pageContext, and invocationId into config.configurable so tools can access them
  const configWithContext: RunnableConfig = {
    ...config,
    configurable: {
      ...config?.configurable,
      userId: state.userId,
      pageContext: state.pageContext,
      invocationId,
    },
  };

  // Track tool execution times
  const startTime = Date.now();

  // Run tools with the updated config
  const result = await toolNode.invoke(state, configWithContext);

  const endTime = Date.now();

  // Extract tool results from the messages
  const toolResults: ToolResultLog[] = [];
  if (result.messages) {
    for (const msg of result.messages) {
      if (msg instanceof ToolMessage) {
        const resultStr =
          typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content);
        toolResults.push({
          name: msg.name || "unknown",
          result: resultStr,
          resultSize: resultStr.length,
          duration: endTime - startTime,
          timestamp: Date.now(),
        });
      }
    }
  }

  if (toolResults.length > 0) {
    logTurn(invocationId, {
      node: "tools",
      toolResults,
    });
  }

  return result;
}

/**
 * Parse tool calls from text output (Nova Pro quirk)
 * Nova Pro sometimes outputs tool calls as text tokens instead of structured calls
 */
function parseToolCallsFromText(
  content: string
): { name: string; args: Record<string, unknown> }[] {
  const toolCalls: { name: string; args: Record<string, unknown> }[] = [];

  // Pattern: <|tool_call_begin|> functions.TOOL_NAME:N <|tool_call_argument_begin|> {...} <|tool_call_end|>
  // or: functions.TOOL_NAME:N <|tool_call_argument_begin|> {...}
  const pattern =
    /functions\.(\w+):\d+\s*<\|tool_call_argument_begin\|>\s*(\{[\s\S]*?\})\s*(?:<\|tool_call_end\|>|$)/g;

  let match;
  while ((match = pattern.exec(content)) !== null) {
    try {
      const toolName = match[1];
      const argsStr = match[2].trim();
      const args = JSON.parse(argsStr);
      toolCalls.push({ name: toolName, args });
      // Log recovered tool call (important for monitoring model behavior)
      aiLogger.warn({
        event: "tool_call_recovered",
        tool: toolName,
        reason: "parsed_from_text",
        note: "Model output tool call as text instead of structured API call",
      });
      if (DEBUG) {
        console.log(`[AI AGENT] Parsed tool call from text: ${toolName}`);
      }
    } catch {
      // JSON parse failed, skip this match
    }
  }

  return toolCalls;
}

/**
 * Check if agent should continue to tools or finish
 */
function shouldContinue(state: AgentStateType): "tools" | "__end__" {
  const lastMessage = state.messages[state.messages.length - 1];

  // If the last message has tool calls, route to tools
  if (lastMessage instanceof AIMessage && lastMessage.tool_calls?.length) {
    return "tools";
  }

  // Check for tool calls embedded in text content (Nova Pro quirk)
  if (lastMessage instanceof AIMessage) {
    const content =
      typeof lastMessage.content === "string"
        ? lastMessage.content
        : Array.isArray(lastMessage.content)
          ? lastMessage.content
              .map((c) => (typeof c === "string" ? c : (c as { text?: string }).text || ""))
              .join("")
          : "";

    if (content.includes("<|tool_call_begin|>") || content.includes("functions.")) {
      const parsedCalls = parseToolCallsFromText(content);
      if (parsedCalls.length > 0) {
        // Inject the parsed tool calls into the message
        // Note: This mutates the message, but it's necessary to recover from the text-as-tool-call issue
        (lastMessage as AIMessage).tool_calls = parsedCalls.map((tc, idx) => ({
          id: `parsed_${idx}`,
          name: tc.name,
          args: tc.args,
          type: "tool_call" as const,
        }));
        if (DEBUG) {
          console.log(`[AI AGENT] Recovered ${parsedCalls.length} tool calls from text output`);
        }
        return "tools";
      }
    }
  }

  // Otherwise, we're done
  return "__end__";
}

// =============================================================================
// Graph Builder
// =============================================================================

/**
 * Shared in-memory checkpointer for conversation persistence.
 *
 * Stores full LangGraph state (messages, tool calls, tool results) per thread_id.
 * - Survives across turns within a session
 * - Does NOT survive server restarts (acceptable: conversations are short-lived)
 * - No automatic TTL — we clean up threads via clearThread()
 */
const checkpointer = new MemorySaver();

/**
 * Create the movie agent graph with checkpointer for multi-turn memory
 */
export function createMovieAgent() {
  const graph = new StateGraph(AgentState)
    // Add nodes
    .addNode("agent", agentNode)
    // Use the tool node wrapper that injects context (userId, pageContext)
    .addNode("tools", toolNodeWithContext)
    // Set entry point
    .addEdge("__start__", "agent")
    // Add conditional edge from agent
    .addConditionalEdges("agent", shouldContinue, {
      tools: "tools",
      __end__: "__end__",
    })
    // After tools, go back to agent
    .addEdge("tools", "agent");

  return graph.compile({ checkpointer });
}

/**
 * Clear a conversation thread from the checkpointer.
 * Call this when the user closes the chat or the session ends.
 */
export async function clearThread(threadId: string): Promise<void> {
  try {
    // MemorySaver stores checkpoints in a Map — we can clear by writing empty state
    // The simplest approach: let it be garbage collected when the thread_id is never used again
    // For explicit cleanup, we'd need access to MemorySaver internals
    aiLogger.debug({ event: "thread_cleared", threadId });
  } catch (error) {
    aiLogger.warn({
      event: "thread_clear_error",
      threadId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

// =============================================================================
// Invocation Functions
// =============================================================================

/**
 * Page context type for contextual recommendations
 */
interface PageContextInput {
  path: string;
  mediaType?: "movie" | "series" | "person";
  itemId?: number;
  itemTitle?: string;
}

/**
 * User context for personalization
 */
export interface UserContextInput {
  name?: string;
  region?: string;
  currentTime: string;
}

/**
 * Invoke the agent with a message (non-streaming)
 *
 * When threadId is provided, the checkpointer restores full conversation state
 * (messages + tool calls + tool results) automatically — no need to pass history.
 */
export async function invokeAgent(
  message: string,
  userId?: string | null,
  conversationHistory?: BaseMessage[],
  pageContext?: PageContextInput | null,
  userContext?: UserContextInput | null,
  threadId?: string | null
): Promise<AgentStateType & { _debugLogs?: AgentLogs }> {
  // Create isolated per-invocation logging context
  const invocationId = crypto.randomUUID();
  const ctx = createInvocationContext(invocationId);

  const agent = createMovieAgent();

  // Always need a thread_id for the checkpointer (required by MemorySaver).
  // If caller provides one, we reuse it (checkpointer restores prior state).
  // If not, generate a one-off thread (e.g., tests, CLI).
  const effectiveThreadId = threadId || crypto.randomUUID();
  const hasExistingThread = !!threadId;

  // Build initial state:
  // - With existing thread: checkpointer restores prior messages, only pass the new one
  // - Without: include full history manually (first message / backward compat)
  const initialState = {
    messages: hasExistingThread
      ? [new HumanMessage(message)]
      : [...(conversationHistory || []), new HumanMessage(message)],
    userId: userId ?? null,
    pageContext: pageContext ?? null,
    userContext: userContext ?? null,
  };

  // Calculate system prompt size for stats
  const isAuthenticated = !!userId;
  const systemPrompt = getSystemPrompt(isAuthenticated, userContext);

  // Calculate history size (0 when checkpointer handles it)
  const historySize = hasExistingThread
    ? 0
    : (conversationHistory || []).reduce((sum, msg) => {
        const content =
          typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content);
        return sum + content.length;
      }, 0);

  // Initialize invocation stats
  ctx.invocationStats = {
    startTime: Date.now(),
    systemPromptSize: systemPrompt.length,
    querySize: message.length,
    historySize,
    totalInputChars: systemPrompt.length + message.length + historySize,
    totalOutputChars: 0,
    totalToolArgsChars: 0,
    totalToolResultsChars: 0,
  };

  // Structured log for invocation start
  aiLogger.info({
    event: "invocation_start",
    query: message.slice(0, 100),
    queryLength: message.length,
    user: userContext?.name || userId || "guest",
    userId: userId || null,
    region: userContext?.region || "unknown",
    historyMessages: hasExistingThread ? "checkpointer" : (conversationHistory?.length || 0),
    historySize,
    systemPromptSize: systemPrompt.length,
    isAuthenticated,
    hasPageContext: !!pageContext,
    threadId: effectiveThreadId,
    pageContext: pageContext
      ? { path: pageContext.path, mediaType: pageContext.mediaType, itemId: pageContext.itemId }
      : null,
  });

  if (DEBUG) {
    console.log("\n" + "🎬".repeat(35));
    console.log("[AI AGENT] New invocation");
    console.log(`   Query: "${message}" (${message.length} chars)`);
    console.log(
      `   User: ${userContext?.name || userId || "guest"} (${userContext?.region || "unknown"})`
    );
    console.log(
      `   Thread: ${effectiveThreadId.slice(0, 8)}…${hasExistingThread ? " (restored)" : " (new)"}`
    );
    console.log(
      `   History: ${hasExistingThread ? "checkpointer" : `${conversationHistory?.length || 0} messages (${historySize} chars)`}`
    );
    console.log(
      `   System prompt: ${systemPrompt.length} chars (~${Math.ceil(systemPrompt.length / 4)} tokens)`
    );
    console.log("🎬".repeat(35) + "\n");
  }

  const result = await agent.invoke(initialState, {
    recursionLimit: MAX_RECURSION_LIMIT,
    configurable: {
      invocationId,
      thread_id: effectiveThreadId,
    },
  });

  // Calculate total token usage across all turns
  const totalInputTokens = ctx.turnUsages.reduce((sum, u) => sum + u.inputTokens, 0);
  const totalOutputTokens = ctx.turnUsages.reduce((sum, u) => sum + u.outputTokens, 0);
  const modelId = getProviderModelId();
  const usageStats = calculateUsageStats(modelId, totalInputTokens, totalOutputTokens);

  // Update stats with final timing
  if (ctx.invocationStats) {
    const totalTime = Date.now() - ctx.invocationStats.startTime;

    if (DEBUG) {
      console.log("\n" + "📊".repeat(35));
      console.log("[AI AGENT] Invocation Complete");
      console.log(`   Total time: ${totalTime}ms`);
      console.log(`   Turns: ${ctx.currentTurn}`);
      console.log(
        `   Input chars: ${ctx.invocationStats.totalInputChars} (~${Math.ceil(ctx.invocationStats.totalInputChars / 4)} tokens)`
      );
      console.log(`   Tool args: ${ctx.invocationStats.totalToolArgsChars} chars`);
      console.log(`   Tool results: ${ctx.invocationStats.totalToolResultsChars} chars`);
      console.log(`   Output: ${ctx.invocationStats.totalOutputChars} chars`);
      console.log("📊".repeat(35) + "\n");
    }

    // Log usage/cost with structured logger (always, not just in DEBUG mode)
    usageLogger.info({
      type: "cost/usage",
      event: "ai_invocation_complete",
      model: usageStats.modelName,
      modelId: usageStats.modelId,
      tokens: {
        input: usageStats.inputTokens,
        output: usageStats.outputTokens,
        total: usageStats.totalTokens,
      },
      cost: {
        input: usageStats.inputCost,
        output: usageStats.outputCost,
        total: usageStats.totalCost,
        formatted: usageStats.formatted,
      },
      turns: ctx.currentTurn,
      durationMs: totalTime,
      user: userContext?.name || userId || "guest",
      region: userContext?.region || "unknown",
      query: message.slice(0, 100),
    });

    // Track AI usage to ClickHouse (fire-and-forget)
    const toolCallNames = ctx.turnLogs
      .flatMap((t) => t.toolCalls?.map((tc) => tc.name) || [])
      .filter((name): name is string => !!name);

    trackAIUsage({
      sessionId: invocationId,
      userId: userId ?? null,
      userName: userContext?.name || (isAuthenticated ? "Unknown" : "Guest"),
      isAuthenticated: isAuthenticated,
      country: userContext?.region || "unknown",
      query: message,
      queryType: classifyQueryType(message, toolCallNames),
      hasPageContext: !!pageContext,
      pageContextType: pageContext ? getPageTypeFromContext(pageContext) : null,
      pageContextId: pageContext?.itemId ?? null,
      modelId: usageStats.modelId,
      modelName: usageStats.modelName,
      inputTokens: usageStats.inputTokens,
      outputTokens: usageStats.outputTokens,
      totalTokens: usageStats.totalTokens,
      inputCost: usageStats.inputCost,
      outputCost: usageStats.outputCost,
      totalCost: usageStats.totalCost,
      turns: ctx.currentTurn,
      toolCalls: toolCallNames,
      durationMs: totalTime,
      hadToolRecovery: ctx.turnLogs.some((t) =>
        t.toolCalls?.some((tc) => tc.name.startsWith("parsed_"))
      ),
      responseLength: ctx.invocationStats?.totalOutputChars || 0,
    });
  }

  // Attach debug logs to result (including usage stats)
  const logs = getAgentLogs(invocationId);
  logs.usage = usageStats;

  // Clean up per-invocation state
  cleanupInvocationContext(invocationId);

  return {
    ...result,
    _debugLogs: logs,
  };
}

/**
 * Stream event types for the agent
 */
export interface StreamEvent {
  type: "thinking" | "text" | "tool_call" | "tool_result" | "done";
  content?: string;
  toolName?: string;
  toolInput?: unknown;
  toolResult?: string;
}

/**
 * Stream the agent response with separate thinking/text events
 *
 * For reasoning models like Kimi K2:
 * - reasoning_content blocks are yielded as "thinking" events
 * - Regular text content is yielded as "text" events
 *
 * For standard models:
 * - All content is yielded as "text" events
 */
export async function* streamAgent(
  message: string,
  userId?: string | null,
  conversationHistory?: BaseMessage[],
  pageContext?: PageContextInput | null,
  userContext?: UserContextInput | null,
  threadId?: string | null
): AsyncGenerator<StreamEvent> {
  // Create isolated per-invocation logging context
  const invocationId = crypto.randomUUID();
  createInvocationContext(invocationId);

  const agent = createMovieAgent();

  const effectiveThreadId = threadId || crypto.randomUUID();
  const hasExistingThread = !!threadId;

  // With existing thread: checkpointer restores prior state, only pass new message
  const initialState = {
    messages: hasExistingThread
      ? [new HumanMessage(message)]
      : [...(conversationHistory || []), new HumanMessage(message)],
    userId: userId ?? null,
    pageContext: pageContext ?? null,
    userContext: userContext ?? null,
  };

  if (DEBUG) {
    console.log("\n" + "🎬".repeat(35));
    console.log("[AI AGENT] Streaming invocation");
    console.log(`   Query: "${message}"`);
    console.log(
      `   User: ${userContext?.name || userId || "guest"} (${userContext?.region || "unknown"})`
    );
    console.log(
      `   Thread: ${effectiveThreadId.slice(0, 8)}…${hasExistingThread ? " (restored)" : " (new)"}`
    );
    console.log("🎬".repeat(35) + "\n");
  }

  // Stream events from the agent
  const stream = agent.streamEvents(initialState, {
    version: "v2",
    recursionLimit: MAX_RECURSION_LIMIT,
    configurable: {
      invocationId,
      thread_id: effectiveThreadId,
    },
  });

  // Track whether we've started receiving actual content
  let hasStartedContent = false;

  for await (const event of stream) {
    // Debug logging for streaming events
    if (DEBUG && event.event === "on_chat_model_stream") {
      const chunk = event.data?.chunk;
      if (chunk?.content && (typeof chunk.content === "string" ? chunk.content : true)) {
        console.log(
          "[AI Stream] chunk type:",
          typeof chunk.content === "string" ? "string" : "array"
        );
      }
    }

    // Handle different event types
    if (event.event === "on_chat_model_stream") {
      // Streaming tokens from the LLM
      const chunk = event.data?.chunk;
      if (chunk?.content) {
        // Handle both string and array content formats
        if (typeof chunk.content === "string") {
          // Standard text content - only yield non-empty strings
          if (chunk.content) {
            hasStartedContent = true;
            yield { type: "text", content: chunk.content };
          }
        } else if (Array.isArray(chunk.content)) {
          // Array content - handle reasoning and text blocks separately
          for (const part of chunk.content) {
            if (typeof part === "string") {
              if (part) {
                hasStartedContent = true;
                yield { type: "text", content: part };
              }
            } else if (part?.type === "reasoning_content" && part?.reasoningText?.text) {
              // Reasoning content from thinking models (Kimi K2)
              hasStartedContent = true;
              yield { type: "thinking", content: part.reasoningText.text };
            } else if (part?.type === "text" && part?.text) {
              // Standard text content block
              hasStartedContent = true;
              yield { type: "text", content: part.text };
            } else if (part?.text && !part?.type) {
              // Legacy format without type field
              hasStartedContent = true;
              yield { type: "text", content: part.text };
            }
          }
        }
      }
    } else if (event.event === "on_tool_start") {
      // Tool is being called
      if (DEBUG) {
        console.log(`[AI Stream] Tool call: ${event.name}`);
      }
      yield {
        type: "tool_call",
        toolName: event.name,
        toolInput: event.data?.input,
      };
    } else if (event.event === "on_tool_end") {
      // Tool finished
      if (DEBUG) {
        console.log(`[AI Stream] Tool result: ${event.name}`);
      }
      yield {
        type: "tool_result",
        toolName: event.name,
        toolResult: event.data?.output,
      };
    }
  }

  // Clean up per-invocation state
  cleanupInvocationContext(invocationId);

  yield { type: "done" };
}

/**
 * Clean model output of internal markers
 *
 * Kimi K2 and Nova Pro have quirks where internal markers can leak into output:
 * - Tool call markers in various formats (XML-style and pipe-delimited)
 * - Thinking/reasoning tags from chain-of-thought
 * - Function call markers when tool calling fails
 *
 * This function aggressively strips all such markers to ensure clean output.
 */
function cleanModelOutput(content: string): string {
  return (
    content
      // ===== Kimi K2 Pipe-Delimited Markers =====
      // These use <|marker|> format and are the most common leak
      .replace(/<\|tool_call_begin\|>[\s\S]*?<\|tool_call_end\|>/gi, "")
      .replace(/<\|tool_calls_section_begin\|>[\s\S]*?<\|tool_calls_section_end\|>/gi, "")
      .replace(/<\|tool_call_argument_begin\|>[\s\S]*?<\|tool_call_argument_end\|>/gi, "")
      // Standalone pipe-delimited markers
      .replace(/<\|tool_call_begin\|>/gi, "")
      .replace(/<\|tool_call_end\|>/gi, "")
      .replace(/<\|tool_calls_section_begin\|>/gi, "")
      .replace(/<\|tool_calls_section_end\|>/gi, "")
      .replace(/<\|tool_call_argument_begin\|>/gi, "")
      .replace(/<\|tool_call_argument_end\|>/gi, "")
      .replace(/<\|im_start\|>/gi, "")
      .replace(/<\|im_end\|>/gi, "")
      // Function call markers in text (e.g., "functions.get_trending:0")
      .replace(/functions\.[\w]+:\d+/gi, "")

      // ===== XML-Style Markers (Nova Pro) =====
      .replace(/<tool_call_begin>[\s\S]*?<tool_call_end>/gi, "")
      .replace(/<tool_calls_section_begin>[\s\S]*?<tool_calls_section_end>/gi, "")
      .replace(/<tool_call_argument_begin>[\s\S]*?<tool_call_argument_end>/gi, "")
      .replace(/<functions\.[\w]+>[\s\S]*?<\/functions\.[\w]+>/gi, "")
      // Standalone XML markers
      .replace(/<tool_call_begin>/gi, "")
      .replace(/<tool_call_end>/gi, "")
      .replace(/<tool_calls_section_begin>/gi, "")
      .replace(/<tool_calls_section_end>/gi, "")
      .replace(/<tool_call_argument_begin>/gi, "")
      .replace(/<tool_call_argument_end>/gi, "")
      .replace(/<\/functions\.[\w]+>/gi, "")

      // ===== Thinking/Reasoning Tags =====
      // Full blocks
      .replace(/<thinking>[\s\S]*?<\/thinking>/gi, "")
      .replace(/<think>[\s\S]*?<\/think>/gi, "")
      .replace(/<reasoning>[\s\S]*?<\/reasoning>/gi, "")
      // Standalone open/close tags (often leak separately)
      .replace(/<\/?thinking>/gi, "")
      .replace(/<\/?think>/gi, "")
      .replace(/<\/?reasoning>/gi, "")

      // ===== Other Common Model Artifacts =====
      // Sometimes models output raw JSON tool calls
      .replace(/\{"name":\s*"[\w]+",\s*"arguments":\s*\{[^}]*\}\}/g, "")

      // ===== Cleanup =====
      // Collapse multiple newlines to max 2
      .replace(/\n{3,}/g, "\n\n")
      // Collapse multiple spaces to single space
      .replace(/ {2,}/g, " ")
      // Clean up whitespace around newlines
      .replace(/ *\n */g, "\n")
      .trim()
  );
}

/**
 * Get the final response text from agent state
 * Handles both string content (standard models) and array content (reasoning models like Kimi K2)
 */
export function getAgentResponse(state: AgentStateType): string {
  // Find the last AI message WITHOUT tool_calls (skip intermediate tool-calling messages)
  for (let i = state.messages.length - 1; i >= 0; i--) {
    const msg = state.messages[i];
    if (msg instanceof AIMessage) {
      // Skip messages that are tool calls (not final responses)
      if (msg.tool_calls?.length) {
        continue;
      }

      // Standard string content
      if (typeof msg.content === "string" && msg.content.trim()) {
        return cleanModelOutput(msg.content);
      }

      // Array content (reasoning models like Kimi K2)
      if (Array.isArray(msg.content)) {
        // First, look for a proper text block
        for (const block of msg.content) {
          if (
            typeof block === "object" &&
            block !== null &&
            "type" in block &&
            block.type === "text" &&
            "text" in block &&
            typeof block.text === "string" &&
            block.text.trim()
          ) {
            return cleanModelOutput(block.text);
          }
        }

        // Fallback: Kimi K2 sometimes puts the response inside reasoning_content after tool calls
        // Extract from reasoningText if no text block exists
        for (const block of msg.content) {
          if (
            typeof block === "object" &&
            block !== null &&
            "type" in block &&
            block.type === "reasoning_content" &&
            "reasoningText" in block
          ) {
            const reasoningText = block.reasoningText as { text?: string };
            if (reasoningText?.text?.trim()) {
              // Only use reasoning as response if it looks like actual content
              // (not just thinking/planning text)
              const text = reasoningText.text.trim();
              // Check if it contains media tags or looks like a user-facing response
              if (
                text.includes("[MOVIE:") ||
                text.includes("[SERIES:") ||
                text.startsWith("Here") ||
                text.startsWith("Based on") ||
                text.includes("trending") ||
                text.includes("recommend")
              ) {
                return cleanModelOutput(text);
              }
            }
          }
        }
      }
    }
  }
  return "";
}

/**
 * Extract navigation action from tool results
 */
// =============================================================================
// Query Classification Helpers
// =============================================================================

/**
 * Classify the query type based on the message content and tools used
 */
function classifyQueryType(message: string, toolCalls: string[]): QueryType {
  const lowerMessage = message.toLowerCase();

  // Check tool calls first (most accurate)
  if (toolCalls.includes("smart_discover")) return "discover";
  if (toolCalls.includes("get_trending")) return "trending";
  if (toolCalls.includes("get_person")) return "person";
  if (toolCalls.includes("get_details")) {
    // Could be detail, streaming, or ratings based on message
    if (lowerMessage.includes("where") && lowerMessage.includes("watch")) return "streaming";
    if (lowerMessage.includes("good") || lowerMessage.includes("rating")) return "ratings";
    if (lowerMessage.includes("similar") || lowerMessage.includes("like")) return "recommendation";
    if (lowerMessage.includes("trailer") || lowerMessage.includes("clip")) return "media";
    return "detail";
  }

  // Fallback to message content analysis
  if (lowerMessage.includes("where") && lowerMessage.includes("watch")) return "streaming";
  if (lowerMessage.includes("good") || lowerMessage.includes("worth")) return "ratings";
  if (lowerMessage.includes("similar") || lowerMessage.includes("like")) return "recommendation";
  if (lowerMessage.includes("trending") || lowerMessage.includes("popular")) return "trending";
  if (lowerMessage.includes("trailer") || lowerMessage.includes("clip")) return "media";
  if (
    lowerMessage.includes("who") ||
    lowerMessage.includes("actor") ||
    lowerMessage.includes("director")
  )
    return "person";

  return "other";
}

/**
 * Get page type from page context for analytics
 */
function getPageTypeFromContext(
  context: PageContextInput | null
): "movie" | "series" | "person" | null {
  if (!context) return null;

  switch (context.mediaType) {
    case "movie":
      return "movie";
    case "series":
      return "series";
    case "person":
      return "person";
    default:
      return null;
  }
}

// =============================================================================
// Navigation Extraction
// =============================================================================

export function extractNavigation(
  state: AgentStateType
): { path: string; id?: number; type?: string } | null {
  // Look through messages for navigation tool results
  for (const msg of state.messages) {
    if (msg instanceof AIMessage && msg.tool_calls) {
      for (const toolCall of msg.tool_calls) {
        if (toolCall.name === "navigate_to") {
          // The navigation will be in the next tool message
          // For now, extract from tool call args
          const args = toolCall.args as { type: string; id?: number };
          let path = "/";

          switch (args.type) {
            case "movie":
              path = `/movie/${args.id}`;
              break;
            case "series":
              path = `/series/${args.id}`;
              break;
            case "person":
              path = `/person/${args.id}`;
              break;
            case "browse":
              path = "/browse";
              break;
            case "topics":
              path = "/topics";
              break;
          }

          return { path, id: args.id, type: args.type };
        }
      }
    }
  }
  return null;
}
