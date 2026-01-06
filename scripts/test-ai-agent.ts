#!/usr/bin/env npx tsx
/**
 * AI Agent Test Script
 *
 * Tests the AI movie agent by invoking it directly (bypassing HTTP).
 * Run with: yarn test:ai
 * Or with custom query: yarn test:ai "your question here"
 *
 * Options:
 *   --user, -u    Include user context tests
 *   --debug, -d   Show detailed tool I/O and token info
 *   --verbose, -v Show full responses (not truncated)
 *
 * Requires:
 * 1. AWS credentials in .env.local:
 *    - AWS_ACCESS_KEY_ID
 *    - AWS_SECRET_ACCESS_KEY
 *    - BEDROCK_REGION (optional, defaults to us-east-1 for Kimi K2)
 *    - BEDROCK_MODEL_ID (optional, defaults to moonshot.kimi-k2-thinking)
 *
 * 2. Model access enabled in AWS Bedrock console:
 *    - Go to AWS Console > Amazon Bedrock > Model access
 *    - Enable the models you want to use
 *
 * 3. TMDB API key for movie data:
 *    - TMDB_API_KEY
 */

import { config } from "dotenv";
import { resolve } from "path";

// Load env from .env.local
config({ path: resolve(process.cwd(), ".env.local") });

// Note: AI_DEBUG is enabled by default in the agent code

// =============================================================================
// Environment Validation
// =============================================================================

console.log("🎬 AI Movie Agent Test Suite");
console.log("============================\n");

// Check required env vars
const missingVars: string[] = [];
if (!process.env.AWS_ACCESS_KEY_ID) missingVars.push("AWS_ACCESS_KEY_ID");
if (!process.env.AWS_SECRET_ACCESS_KEY) missingVars.push("AWS_SECRET_ACCESS_KEY");
if (!process.env.TMDB_API_KEY) missingVars.push("TMDB_API_KEY");

if (missingVars.length > 0) {
  console.error("❌ Missing required environment variables:");
  missingVars.forEach((v) => console.error(`   - ${v}`));
  console.error("\n📋 Setup Instructions:");
  console.error("   1. Copy template.env to .env.local");
  console.error("   2. Fill in the required values");
  console.error("   3. For AWS Bedrock, ensure model access is enabled");
  process.exit(1);
}

console.log("✅ Environment loaded");
console.log(`   BEDROCK_REGION: ${process.env.BEDROCK_REGION || process.env.AWS_REGION || "us-east-1 (default)"}`);
console.log(`   BEDROCK_MODEL_ID: ${process.env.BEDROCK_MODEL_ID || "(default: Kimi K2)"}`);
console.log(`   TMDB_API_KEY: ${process.env.TMDB_API_KEY ? "✓ set" : "✗ missing"}`);
console.log("");

// =============================================================================
// Test Queries
// =============================================================================

const TEST_QUERIES = [
  "Show me popular horror series",
  "What are some good horror movies from 2024?",
  "Find me Korean thriller movies",
  "What's trending right now?",
  "Search for Christopher Nolan",
  "I want to watch something like Inception",
];

/**
 * Test queries that require user context (Phase 2)
 * These test the user data tools (watchlist, ratings, watched)
 */
const USER_CONTEXT_QUERIES = [
  "What's in my watchlist?",
  "Based on what I've liked, recommend something",
  "What movies have I already watched?",
];

// =============================================================================
// Types for debugging
// =============================================================================

interface ToolCallInfo {
  name: string;
  args: unknown;
  argsSize: number;
}

interface ToolResultInfo {
  name: string;
  resultSize: number;
  resultPreview: string;
  duration?: number;
}

interface InvocationStats {
  systemPromptSize: number;
  querySize: number;
  historySize: number;
  totalInputChars: number;
  totalOutputChars: number;
  totalToolArgsChars: number;
  totalToolResultsChars: number;
}

interface TestResult {
  success: boolean;
  elapsed: number;
  toolCalls: ToolCallInfo[];
  toolResults: ToolResultInfo[];
  responseLength: number;
  turns: number;
  stats?: InvocationStats | null;
  error?: string;
}

// =============================================================================
// Test Runner
// =============================================================================

// Dynamic import to ensure env is loaded first
let invokeAgent: typeof import("../src/server/ai").invokeAgent;
let getAgentResponse: typeof import("../src/server/ai").getAgentResponse;
let extractNavigation: typeof import("../src/server/ai").extractNavigation;

async function loadAgent() {
  const ai = await import("../src/server/ai");
  invokeAgent = ai.invokeAgent;
  getAgentResponse = ai.getAgentResponse;
  extractNavigation = ai.extractNavigation;
}

type AgentStateType = Awaited<ReturnType<typeof invokeAgent>>;

interface TestOptions {
  verbose: boolean;
  debug: boolean;
}

async function runTest(
  query: string,
  index: number,
  userId: string | null = null,
  options: TestOptions = { verbose: false, debug: false }
): Promise<TestResult> {
  console.log(`\n${"=".repeat(70)}`);
  console.log(`TEST ${index + 1}: "${query}"${userId ? " (authenticated)" : ""}`);
  console.log("=".repeat(70));

  const startTime = Date.now();

  try {
    // Invoke the agent with optional userId
    const result = await invokeAgent(query, userId, []);

    const elapsed = Date.now() - startTime;

    // Get the response
    const response = getAgentResponse(result);
    const navigation = extractNavigation(result);

    // Get debug logs with stats
    const debugLogs = result._debugLogs;
    const turns = debugLogs?.totalTurns || 0;
    
    // Extract detailed tool information
    const { toolCalls, toolResults } = extractDetailedToolInfo(result, options);

    // Get stats from debug logs
    const stats = debugLogs?.stats;

    // Print results
    console.log(`\n⏱️  Time: ${elapsed}ms | Turns: ${turns}`);
    
    if (options.debug || options.verbose) {
      if (stats) {
        console.log(`\n📊 Context & Token Estimation:`);
        console.log(`   System prompt: ${stats.systemPromptSize} chars (~${estimateTokens(stats.systemPromptSize)} tokens)`);
        console.log(`   Query: ${stats.querySize} chars`);
        console.log(`   History: ${stats.historySize} chars`);
        console.log(`   ─────────────────────────`);
        console.log(`   Total input: ${stats.totalInputChars} chars (~${estimateTokens(stats.totalInputChars)} tokens)`);
        console.log(`   Tool args: ${stats.totalToolArgsChars} chars`);
        console.log(`   Tool results: ${stats.totalToolResultsChars} chars`);
        console.log(`   Response: ${response.length} chars (~${estimateTokens(response.length)} tokens)`);
        console.log(`   ─────────────────────────`);
        const totalContext = stats.totalInputChars + stats.totalToolResultsChars;
        console.log(`   Total context: ~${estimateTokens(totalContext)} tokens (sent to LLM)`);
      } else {
        console.log(`\n📊 Token Estimation:`);
        console.log(`   Input (approx): ${estimateTokens(query.length)} tokens`);
        console.log(`   Tool args total: ${toolCalls.reduce((sum, tc) => sum + tc.argsSize, 0)} chars`);
        console.log(`   Tool results total: ${toolResults.reduce((sum, tr) => sum + tr.resultSize, 0)} chars`);
        console.log(`   Response: ${response.length} chars (~${estimateTokens(response.length)} tokens)`);
      }
    }

    // Show tool calls with args
    if (toolCalls.length > 0) {
      console.log(`\n🔧 Tools Called (${toolCalls.length}):`);
      for (const tc of toolCalls) {
        console.log(`   ┌─ ${tc.name}`);
        if (options.debug) {
          const argsStr = JSON.stringify(tc.args, null, 2);
          const argsLines = argsStr.split("\n");
          for (const line of argsLines) {
            console.log(`   │  ${line}`);
          }
        } else {
          const argsStr = JSON.stringify(tc.args);
          const truncated = argsStr.length > 100 ? argsStr.slice(0, 100) + "..." : argsStr;
          console.log(`   │  Args: ${truncated}`);
        }
        console.log(`   └─ (${tc.argsSize} chars)`);
      }
    } else {
      console.log(`\n⚠️  No tools used - LLM answered directly`);
    }

    // Show tool results
    if (options.debug && toolResults.length > 0) {
      console.log(`\n📥 Tool Results:`);
      for (const tr of toolResults) {
        console.log(`   ┌─ ${tr.name} (${tr.duration || "?"}ms)`);
        console.log(`   │  Size: ${tr.resultSize} chars`);
        const preview = options.verbose ? tr.resultPreview : tr.resultPreview.slice(0, 200);
        console.log(`   └─ ${preview}${preview.length < tr.resultPreview.length ? "..." : ""}`);
      }
    }

    // Show response
    const responsePreview = options.verbose ? response : (response.length > 500 ? response.slice(0, 500) + "..." : response);
    console.log(`\n📝 Response:\n${responsePreview}`);

    if (navigation) {
      console.log(`\n🔗 Navigation: ${navigation.path}`);
    }

    // Flag potential issues
    checkForIssues(query, toolCalls, toolResults, response);

    return {
      success: true,
      elapsed,
      toolCalls,
      toolResults,
      responseLength: response.length,
      turns,
      stats: debugLogs?.stats,
    };
  } catch (error) {
    const elapsed = Date.now() - startTime;
    const errorMessage = formatError(error);

    console.error(`\n❌ Error after ${elapsed}ms:`);
    console.error(errorMessage);

    return {
      success: false,
      elapsed,
      toolCalls: [],
      toolResults: [],
      responseLength: 0,
      turns: 0,
      error: errorMessage,
    };
  }
}

function extractDetailedToolInfo(
  result: AgentStateType,
  options: TestOptions
): { toolCalls: ToolCallInfo[]; toolResults: ToolResultInfo[] } {
  const toolCalls: ToolCallInfo[] = [];
  const toolResults: ToolResultInfo[] = [];

  for (const msg of result.messages) {
    // Extract tool calls from AI messages
    if ("tool_calls" in msg && Array.isArray(msg.tool_calls)) {
      for (const tc of msg.tool_calls as { name: string; args: unknown }[]) {
        const argsStr = JSON.stringify(tc.args);
        toolCalls.push({
          name: tc.name,
          args: tc.args,
          argsSize: argsStr.length,
        });
      }
    }

    // Extract tool results from tool messages
    if (msg.constructor.name === "ToolMessage" || (msg as { name?: string }).name) {
      const content = typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content);
      const name = (msg as { name?: string }).name || "unknown";
      toolResults.push({
        name,
        resultSize: content.length,
        resultPreview: content.slice(0, options.verbose ? 1000 : 300),
      });
    }
  }

  return { toolCalls, toolResults };
}

function estimateTokens(textOrLength: string | number): number {
  // Rough estimation: ~4 chars per token for English
  const length = typeof textOrLength === "string" ? textOrLength.length : textOrLength;
  return Math.ceil(length / 4);
}

function checkForIssues(
  query: string,
  toolCalls: ToolCallInfo[],
  toolResults: ToolResultInfo[],
  response: string
) {
  const issues: string[] = [];

  // Check if "horror series" query used wrong tool or no genre
  if (query.toLowerCase().includes("horror") && query.toLowerCase().includes("series")) {
    const seriesCalls = toolCalls.filter((tc) => tc.name === "discover_series");
    if (seriesCalls.length === 0) {
      issues.push("❗ Query mentions 'series' but discover_series wasn't used");
    } else {
      for (const tc of seriesCalls) {
        const args = tc.args as { genres?: string[] };
        if (!args.genres?.length) {
          issues.push("❗ discover_series called without genres - 'Horror' might not be a valid TV genre");
        }
      }
    }
    
    // Check if results are empty (horror isn't a TV genre)
    for (const tr of toolResults) {
      if (tr.name === "discover_series" && tr.resultPreview.includes('"series":[]')) {
        issues.push("⚠️  Empty results - 'Horror' is NOT a TV genre (only movie). TV has 'Sci-Fi & Fantasy' instead");
      }
    }
  }

  // Check for excessive tool calls (potential issue)
  if (toolCalls.length > 3) {
    issues.push(`⚠️  ${toolCalls.length} tool calls - consider if all are necessary`);
  }

  // Check for large tool results (token waste)
  const totalResultSize = toolResults.reduce((sum, tr) => sum + tr.resultSize, 0);
  if (totalResultSize > 10000) {
    issues.push(`⚠️  Large tool results (${(totalResultSize / 1000).toFixed(1)}KB) - may waste tokens`);
  }

  // Check for no results in discover
  for (const tr of toolResults) {
    if (tr.resultPreview.includes('"totalResults":0') || 
        tr.resultPreview.includes('"movies":[]') || 
        tr.resultPreview.includes('"series":[]')) {
      issues.push(`⚠️  ${tr.name} returned empty results`);
    }
  }

  if (issues.length > 0) {
    console.log(`\n🔍 Issues Detected:`);
    issues.forEach((issue) => console.log(`   ${issue}`));
  }
}

function formatError(error: unknown): string {
  if (error instanceof Error) {
    // Check for common Bedrock errors
    if (error.message.includes("Model use case details have not been submitted")) {
      return `⚠️  BEDROCK ACCESS NOT CONFIGURED

The AWS account doesn't have model access enabled.

To fix this:
1. Go to AWS Console > Amazon Bedrock > Model access
2. Click "Manage model access"
3. Enable the models you want to use (e.g., Amazon Nova Pro)
4. Wait for approval

See: https://docs.aws.amazon.com/bedrock/latest/userguide/model-access.html`;
    }

    if (error.message.includes("model identifier is invalid")) {
      return `⚠️  INVALID MODEL ID

The BEDROCK_MODEL_ID is not valid. Use an inference profile ID like:
- apac.amazon.nova-pro-v1:0 (Amazon Nova Pro - APAC)
- us.anthropic.claude-3-haiku-20240307-v1:0 (Claude 3 Haiku - US)

See: https://docs.aws.amazon.com/bedrock/latest/userguide/inference-profiles.html`;
    }

    if (error.message.includes("TMDB API error: 401")) {
      return `⚠️  TMDB API KEY INVALID

The TMDB_API_KEY is invalid or expired.
Get a new key at: https://www.themoviedb.org/settings/api`;
    }

    return error.message;
  }

  return String(error);
}

// =============================================================================
// Main
// =============================================================================

async function main() {
  // Load agent module after env is configured
  await loadAgent();

  // Parse command line arguments
  const args = process.argv.slice(2);
  const includeUserTests = args.includes("--user") || args.includes("-u");
  const debugMode = args.includes("--debug") || args.includes("-d");
  const verboseMode = args.includes("--verbose") || args.includes("-v");
  const testUserId = process.env.TEST_USER_ID || null;

  const options: TestOptions = {
    debug: debugMode,
    verbose: verboseMode,
  };

  // Remove flags from args to get custom query
  const customQuery = args.filter((a) => !a.startsWith("-")).join(" ");

  if (customQuery) {
    console.log("Running single custom query...");
    console.log(`Mode: ${debugMode ? "debug" : "normal"}, ${verboseMode ? "verbose" : "truncated"}\n`);
    
    // If --user flag is set and we have a test userId, use it
    const userId = includeUserTests ? testUserId : null;
    await runTest(customQuery, 0, userId, options);
    return;
  }

  // Run all test queries
  console.log(`Running ${TEST_QUERIES.length} test queries...`);
  console.log(`Mode: ${debugMode ? "debug" : "normal"}, ${verboseMode ? "verbose" : "truncated"}\n`);

  const results: { query: string; result: TestResult }[] = [];

  for (let i = 0; i < TEST_QUERIES.length; i++) {
    const result = await runTest(TEST_QUERIES[i], i, null, options);
    results.push({ query: TEST_QUERIES[i], result });

    // Small delay between tests to avoid rate limiting
    if (i < TEST_QUERIES.length - 1) {
      await new Promise((r) => setTimeout(r, 1000));
    }
  }

  // Run user context tests if flag is set
  if (includeUserTests) {
    console.log(`\n\n${"=".repeat(70)}`);
    console.log("USER CONTEXT TESTS (Phase 2)");
    console.log("=".repeat(70));

    if (!testUserId) {
      console.log("\n⚠️  No TEST_USER_ID set - testing guest behavior");
      console.log("   Set TEST_USER_ID in .env.local to test authenticated behavior\n");
    } else {
      console.log(`\n✅ Using TEST_USER_ID: ${testUserId}\n`);
    }

    for (let i = 0; i < USER_CONTEXT_QUERIES.length; i++) {
      const result = await runTest(USER_CONTEXT_QUERIES[i], TEST_QUERIES.length + i, testUserId, options);
      results.push({ query: USER_CONTEXT_QUERIES[i], result });

      // Small delay between tests
      if (i < USER_CONTEXT_QUERIES.length - 1) {
        await new Promise((r) => setTimeout(r, 1000));
      }
    }
  }

  // Summary
  console.log(`\n\n${"=".repeat(70)}`);
  console.log("SUMMARY");
  console.log("=".repeat(70));

  const successful = results.filter((r) => r.result.success).length;
  const avgTime = results.reduce((sum, r) => sum + r.result.elapsed, 0) / results.length;
  const totalToolCalls = results.reduce((sum, r) => sum + r.result.toolCalls.length, 0);
  const avgTurns = results.reduce((sum, r) => sum + r.result.turns, 0) / results.length;

  console.log(`\n✅ Passed: ${successful}/${results.length}`);
  console.log(`⏱️  Average time: ${Math.round(avgTime)}ms`);
  console.log(`🔧 Total tool calls: ${totalToolCalls}`);
  console.log(`🔄 Average turns: ${avgTurns.toFixed(1)}`);

  // Tool usage breakdown
  const toolUsage: Record<string, number> = {};
  for (const r of results) {
    for (const tc of r.result.toolCalls) {
      toolUsage[tc.name] = (toolUsage[tc.name] || 0) + 1;
    }
  }
  
  console.log(`\n📊 Tool Usage:`);
  for (const [name, count] of Object.entries(toolUsage).sort((a, b) => b[1] - a[1])) {
    console.log(`   ${name}: ${count}`);
  }

  if (successful < results.length) {
    console.log(`\n❌ Failed queries:`);
    results.filter((r) => !r.result.success).forEach((r) => console.log(`   - "${r.query}"`));
  }

  // Show help if user tests were not run
  if (!includeUserTests) {
    console.log(`\n💡 Tip: Run with --user flag to test user context tools`);
    console.log(`   yarn test:ai --user`);
  }

  console.log(`\n💡 More options:`);
  console.log(`   yarn test:ai --debug         # Show detailed tool I/O`);
  console.log(`   yarn test:ai --verbose       # Show full (not truncated) output`);
  console.log(`   yarn test:ai "your query"    # Test a single query`);

  // Exit with error code if any failed
  if (successful < results.length) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error("\n💥 Unexpected error:", error);
  process.exit(1);
});
