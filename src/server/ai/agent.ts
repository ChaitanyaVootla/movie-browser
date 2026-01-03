/**
 * LangGraph Movie Recommendation Agent
 *
 * Stateful agent for movie discovery and recommendations.
 */

import { StateGraph } from "@langchain/langgraph";
import { ToolNode } from "@langchain/langgraph/prebuilt";
import { AIMessage, HumanMessage, SystemMessage, BaseMessage, ToolMessage } from "@langchain/core/messages";
import { RunnableConfig } from "@langchain/core/runnables";
import { AgentState, type AgentStateType } from "./state";
import { createBedrockChat } from "./bedrock";
import { allTools } from "./tools";
import { getSystemPrompt } from "./prompts/system";

// =============================================================================
// Debug Logging
// =============================================================================

// Debug logging enabled by default - set AI_DEBUG=false to disable
const DEBUG = process.env.AI_DEBUG !== "false";

interface ToolCallLog {
  name: string;
  args: unknown;
  timestamp: number;
}

interface ToolResultLog {
  name: string;
  result: string;
  duration: number;
  timestamp: number;
}

interface TurnLog {
  turn: number;
  node: "agent" | "tools";
  toolCalls?: ToolCallLog[];
  toolResults?: ToolResultLog[];
  response?: string;
  timestamp: number;
}

let currentTurn = 0;
const turnLogs: TurnLog[] = [];

function logTurn(log: Omit<TurnLog, "turn" | "timestamp">) {
  currentTurn++;
  const turnLog: TurnLog = {
    ...log,
    turn: currentTurn,
    timestamp: Date.now(),
  };
  turnLogs.push(turnLog);

  if (DEBUG) {
    console.log("\n" + "=".repeat(70));
    console.log(`[AI AGENT] Turn ${currentTurn} - ${log.node.toUpperCase()}`);
    console.log("=".repeat(70));

    if (log.toolCalls?.length) {
      console.log("\n📤 Tool Calls:");
      for (const tc of log.toolCalls) {
        console.log(`   └─ ${tc.name}`);
        console.log(`      Args: ${JSON.stringify(tc.args, null, 2).split("\n").join("\n      ")}`);
      }
    }

    if (log.toolResults?.length) {
      console.log("\n📥 Tool Results:");
      for (const tr of log.toolResults) {
        const resultPreview = tr.result.length > 500 
          ? tr.result.slice(0, 500) + "... [truncated]" 
          : tr.result;
        console.log(`   └─ ${tr.name} (${tr.duration}ms)`);
        console.log(`      Result: ${resultPreview.split("\n").join("\n      ")}`);
      }
    }

    if (log.response) {
      console.log("\n💬 Response:", log.response.slice(0, 300) + (log.response.length > 300 ? "..." : ""));
    }
  }
}

export function getAgentLogs() {
  return { turns: turnLogs, totalTurns: currentTurn };
}

export function resetAgentLogs() {
  currentTurn = 0;
  turnLogs.length = 0;
}

// =============================================================================
// Agent Nodes
// =============================================================================

/**
 * Agent node - the LLM decides what to do next
 */
async function agentNode(state: AgentStateType): Promise<Partial<AgentStateType>> {
  const model = createBedrockChat().bindTools(allTools);

  // Build messages with system prompt including user context
  const isAuthenticated = !!state.userId;
  const systemPrompt = getSystemPrompt(isAuthenticated, state.userContext);

  // Check if system message already exists
  const hasSystemMessage = state.messages[0] instanceof SystemMessage;

  const messages = hasSystemMessage
    ? state.messages
    : [new SystemMessage(systemPrompt), ...state.messages];

  // Invoke the model
  const response = await model.invoke(messages);

  // Log the turn
  const toolCalls: ToolCallLog[] = [];
  if (response instanceof AIMessage && response.tool_calls?.length) {
    for (const tc of response.tool_calls) {
      toolCalls.push({
        name: tc.name,
        args: tc.args,
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

  logTurn({
    node: "agent",
    toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
    response: responseText,
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

  // Merge userId and pageContext into config.configurable so tools can access it
  const configWithContext: RunnableConfig = {
    ...config,
    configurable: {
      ...config?.configurable,
      userId: state.userId,
      pageContext: state.pageContext,
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
        toolResults.push({
          name: msg.name || "unknown",
          result: typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content),
          duration: endTime - startTime,
          timestamp: Date.now(),
        });
      }
    }
  }

  if (toolResults.length > 0) {
    logTurn({
      node: "tools",
      toolResults,
    });
  }

  return result;
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

  // Otherwise, we're done
  return "__end__";
}

// =============================================================================
// Graph Builder
// =============================================================================

/**
 * Create the movie agent graph
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

  return graph.compile();
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
 */
export async function invokeAgent(
  message: string,
  userId?: string | null,
  conversationHistory?: BaseMessage[],
  pageContext?: PageContextInput | null,
  userContext?: UserContextInput | null
): Promise<AgentStateType & { _debugLogs?: ReturnType<typeof getAgentLogs> }> {
  // Reset logs for this invocation
  resetAgentLogs();
  
  const agent = createMovieAgent();

  const initialState = {
    messages: [...(conversationHistory || []), new HumanMessage(message)],
    userId: userId ?? null,
    pageContext: pageContext ?? null,
    userContext: userContext ?? null,
  };

  if (DEBUG) {
    console.log("\n" + "🎬".repeat(35));
    console.log("[AI AGENT] New invocation");
    console.log(`   Query: "${message}"`);
    console.log(`   User: ${userContext?.name || userId || "guest"} (${userContext?.region || "unknown"})`);
    console.log(`   History: ${conversationHistory?.length || 0} messages`);
    console.log("🎬".repeat(35) + "\n");
  }

  const result = await agent.invoke(initialState);

  // Attach debug logs to result
  return {
    ...result,
    _debugLogs: getAgentLogs(),
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
  userContext?: UserContextInput | null
): AsyncGenerator<StreamEvent> {
  // Reset logs for this invocation
  resetAgentLogs();
  
  const agent = createMovieAgent();

  const initialState = {
    messages: [...(conversationHistory || []), new HumanMessage(message)],
    userId: userId ?? null,
    pageContext: pageContext ?? null,
    userContext: userContext ?? null,
  };

  if (DEBUG) {
    console.log("\n" + "🎬".repeat(35));
    console.log("[AI AGENT] Streaming invocation");
    console.log(`   Query: "${message}"`);
    console.log(`   User: ${userContext?.name || userId || "guest"} (${userContext?.region || "unknown"})`);
    console.log(`   History: ${conversationHistory?.length || 0} messages`);
    console.log("🎬".repeat(35) + "\n");
  }

  // Stream events from the agent
  const stream = agent.streamEvents(initialState, {
    version: "v2",
  });

  // Track whether we've started receiving actual content
  let hasStartedContent = false;

  for await (const event of stream) {
    // Debug logging for streaming events
    if (DEBUG && event.event === "on_chat_model_stream") {
      const chunk = event.data?.chunk;
      if (chunk?.content && (typeof chunk.content === "string" ? chunk.content : true)) {
        console.log("[AI Stream] chunk type:", typeof chunk.content === "string" ? "string" : "array");
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

  yield { type: "done" };
}

/**
 * Clean model output of internal markers
 * Some models (Nova Pro, etc.) output tool call markers as text
 */
function cleanModelOutput(content: string): string {
  return content
    // Remove tool call markers (Nova Pro quirk)
    .replace(/<tool_call_begin>[\s\S]*?<tool_call_end>/gi, "")
    .replace(/<tool_calls_section_begin>[\s\S]*?<tool_calls_section_end>/gi, "")
    .replace(/<tool_call_argument_begin>[\s\S]*?<tool_call_argument_end>/gi, "")
    .replace(/<functions\.[\w]+>[\s\S]*?<\/functions\.[\w]+>/gi, "")
    // Remove standalone/unclosed markers
    .replace(/<tool_call_begin>/gi, "")
    .replace(/<tool_call_end>/gi, "")
    .replace(/<tool_calls_section_begin>/gi, "")
    .replace(/<tool_calls_section_end>/gi, "")
    .replace(/<tool_call_argument_begin>/gi, "")
    .replace(/<tool_call_argument_end>/gi, "")
    .replace(/<\/functions\.[\w]+>/gi, "")
    // Remove thinking tags
    .replace(/<thinking>[\s\S]*?<\/thinking>/gi, "")
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    // Clean up extra whitespace
    .replace(/\s+/g, " ")
    .trim();
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
              if (text.includes("[MOVIE:") || text.includes("[SERIES:") || 
                  text.startsWith("Here") || text.startsWith("Based on") ||
                  text.includes("trending") || text.includes("recommend")) {
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

