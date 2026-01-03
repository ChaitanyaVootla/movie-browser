# AI Movie Agent Implementation Plan

## Overview

This document outlines the phased implementation of an AI-powered movie recommendation agent for Movie Browser. The agent will leverage LangGraph.js for orchestration, AWS Bedrock (Claude Haiku 4.5) as the LLM, and integrate with existing TMDB APIs and user data.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              Client Layer                                    │
├─────────────────────────────────────────────────────────────────────────────┤
│  AssistantFloaty (bottom-center UI)                                         │
│  ├── Idle State: Floating circle + periodic prompt pills                    │
│  ├── Minimal State: Poster cards + text (no chat chrome)                    │
│  │   ├── Poster cards from [MOVIE:id:title|desc] tags (80vw)               │
│  │   ├── Clean text below cards (50vw)                                     │
│  │   ├── Radial gradient backdrop for contrast                              │
│  │   └── Hover: input field + expand/close buttons                         │
│  └── Expanded State: Full chat overlay with history                         │
│                                                                              │
│  Media Tag Parser (src/lib/ai/parse-media-tags.ts)                         │
│  └── Extracts [MOVIE:id:title|desc] and [SERIES:id:title|desc] tags        │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           API Route Layer                                    │
├─────────────────────────────────────────────────────────────────────────────┤
│  /api/ai/chat (POST)                                                        │
│  ├── Streaming response (SSE)                                               │
│  ├── Session management                                                      │
│  └── User context injection                                                  │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                          LangGraph Agent                                     │
├─────────────────────────────────────────────────────────────────────────────┤
│  StateGraph (ReAct pattern)                                                  │
│  ├── Nodes: agent, tools                                                    │
│  └── Edges: conditional routing based on tool calls                         │
│                                                                              │
│  Tools (Phase 1 - Implemented):                                             │
│  ├── search_movies        - TMDB multi-search                               │
│  ├── discover_movies      - TMDB discover with filters                      │
│  ├── discover_series      - TMDB discover TV shows                          │
│  ├── get_trending         - Current trending content                        │
│  └── navigate_to          - Trigger client navigation                       │
│                                                                              │
│  Tools (Phase 2 - Planned):                                                 │
│  ├── get_user_watchlist   - User's watchlist                                │
│  ├── get_user_ratings     - User's likes/dislikes                           │
│  └── get_user_watched     - User's watched history                          │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                            LLM Layer                                         │
├─────────────────────────────────────────────────────────────────────────────┤
│  AWS Bedrock                                                                 │
│  └── Amazon Nova Pro (apac.amazon.nova-pro-v1:0)                           │
│      - Cross-region inference via APAC profile                              │
│      - Region: ap-south-1                                                   │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Tech Stack

### Dependencies to Add

```json
{
  "dependencies": {
    "@langchain/core": "^0.3.x",
    "@langchain/langgraph": "^0.2.x",
    "@langchain/aws": "^0.1.x",
    "@aws-sdk/client-bedrock-runtime": "^3.x"
  }
}
```

### Environment Variables

```bash
# Add to .env.local
AWS_ACCESS_KEY_ID=your-access-key
AWS_SECRET_ACCESS_KEY=your-secret-key

# Region for Bedrock inference profiles
# Use ap-south-1 for APAC profiles, us-east-1 for US profiles
BEDROCK_REGION=ap-south-1

# Model ID - use inference profile ID for cross-region inference
# Recommended:
#   apac.amazon.nova-pro-v1:0                    (Amazon Nova Pro - DEFAULT, proper tool calling)
#   us.anthropic.claude-3-haiku-20240307-v1:0    (Claude 3 Haiku - fast, cost-effective)
#
# NOT Recommended:
#   moonshot.kimi-k2-thinking                    (Kimi K2 - outputs tool calls as text, breaks LangChain)
BEDROCK_MODEL_ID=apac.amazon.nova-pro-v1:0
```

### Model Compatibility Notes

**⚠️ Kimi K2 Not Recommended:**

Kimi K2 (`moonshot.kimi-k2-thinking`) has non-standard behavior where it outputs tool calls as text tokens (e.g., `<|tool_call_begin|>get_trending<|tool_call_end|>`) instead of using Bedrock's structured tool calling API. This means:

- LangChain cannot detect or execute tool calls
- The agent appears to "stop" after saying it will check something
- Tools never actually run

**Recommended Models:**
- **Amazon Nova Pro** - Proper tool calling, good balance of speed/quality
- **Claude 3 Haiku** - Fast, cost-effective, proper tool calling

The agent code includes legacy support for reasoning models (extracting from `reasoning_content` blocks), but this is kept for future compatibility only.

### Enabling Bedrock Model Access

Before using the AI agent, you must enable model access in AWS:

1. Go to [AWS Console > Amazon Bedrock > Model access](https://console.aws.amazon.com/bedrock/home#/modelaccess)
2. Click "Manage model access"
3. Select the models you want to use (Amazon Nova Pro, Claude models, etc.)
4. Submit and wait for approval

See: https://docs.aws.amazon.com/bedrock/latest/userguide/model-access.html

### IAM Permissions Required

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "bedrock:InvokeModel",
        "bedrock:InvokeModelWithResponseStream"
      ],
      "Resource": [
        "arn:aws:bedrock:*::foundation-model/*",
        "arn:aws:bedrock:*:*:inference-profile/*"
      ]
    }
  ]
}
```

---

## Phase 1: Core Agent Infrastructure

**Goal:** Establish the foundational agent architecture with basic movie search/discover tools.

### 1.1 Directory Structure

```
src/
├── server/
│   └── ai/
│       ├── index.ts              # Agent exports
│       ├── agent.ts              # LangGraph StateGraph definition
│       ├── bedrock.ts            # AWS Bedrock client setup
│       ├── state.ts              # Agent state types
│       ├── tools/
│       │   ├── index.ts          # Tool exports + allTools array
│       │   ├── search.ts         # search_movies tool
│       │   ├── discover.ts       # discover_movies, discover_series tools
│       │   ├── trending.ts       # get_trending tool
│       │   ├── navigation.ts     # navigate_to tool (client control)
│       │   ├── user-data.ts      # User context tools (watchlist, ratings, watched)
│       │   ├── context.ts        # get_page_context tool
│       │   └── related.ts        # get_related_content tool
│       └── prompts/
│           └── system.ts         # System prompts (includes media tag instructions)
├── lib/
│   └── ai/
│       ├── index.ts              # Exports parseContent, stripMediaTags
│       └── parse-media-tags.ts   # Media tag parser for UI rendering
├── hooks/
│   └── use-chat-stream.ts        # SSE chat hook with thinking tag filtering
├── app/
│   └── api/
│       └── ai/
│           └── chat/
│               └── route.ts      # Streaming chat endpoint
└── components/
    └── features/
        └── ai/
            ├── index.ts              # Barrel exports
            ├── assistant-floaty.tsx  # Main UI (Idle/Minimal/Expanded states)
            ├── rich-message-content.tsx  # Renders text with inline media chips
            └── media-chip.tsx        # Movie/series chips and poster cards
```

### 1.2 Agent State Definition

```typescript
// src/server/ai/state.ts
import { Annotation, messagesStateReducer } from "@langchain/langgraph";
import type { BaseMessage } from "@langchain/core/messages";

// Media item for recommendations
export interface AgentMediaItem {
  id: number;
  title: string;           // movie.title or series.name
  mediaType: "movie" | "tv";
  posterPath: string | null;
  backdropPath: string | null;
  overview: string;
  voteAverage: number;
  releaseDate: string;     // release_date or first_air_date
  genres: { id: number; name: string }[];
}

// Navigation action for client
export interface NavigationAction {
  type: "navigate";
  path: string;
  params?: Record<string, string>;
}

// Agent state annotation
export const AgentState = Annotation.Root({
  // Conversation messages
  messages: Annotation<BaseMessage[]>({
    reducer: messagesStateReducer,
  }),
  
  // User context
  userId: Annotation<string | null>(),
  
  // Recommendations to display
  recommendations: Annotation<AgentMediaItem[]>({
    reducer: (_, new_) => new_,
    default: () => [],
  }),
  
  // Navigation action for client
  navigation: Annotation<NavigationAction | null>({
    reducer: (_, new_) => new_,
    default: () => null,
  }),
  
  // Whether agent is still thinking
  isComplete: Annotation<boolean>({
    reducer: (_, new_) => new_,
    default: () => false,
  }),
});

export type AgentStateType = typeof AgentState.State;
```

### 1.3 Bedrock Client Setup

```typescript
// src/server/ai/bedrock.ts
import { ChatBedrockConverse } from "@langchain/aws";

// Default to Amazon Nova Pro via APAC inference profile
const DEFAULT_MODEL_ID = "apac.amazon.nova-pro-v1:0";
const DEFAULT_REGION = "ap-south-1";

export function createBedrockChat() {
  const modelId = process.env.BEDROCK_MODEL_ID || DEFAULT_MODEL_ID;
  const region = process.env.BEDROCK_REGION || DEFAULT_REGION;

  return new ChatBedrockConverse({
    model: modelId,
    region,
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
    },
    // Optimize for conversational responses
    maxTokens: 1024,
    temperature: 0.7,
  });
}
```

### 1.4 Tool Definitions

```typescript
// src/server/ai/tools/discover.ts
import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { discoverMoviesAction, discoverTVAction } from "@/server/actions/discover";
import { MOVIE_GENRES, TV_GENRES } from "@/lib/constants";

export const discoverMoviesTool = tool(
  async (input) => {
    const params: Record<string, unknown> = {
      page: 1,
      "vote_count.gte": 100, // Ensure quality results
    };
    
    // Map genre names to IDs
    if (input.genres?.length) {
      const genreIds = input.genres
        .map(name => Object.entries(MOVIE_GENRES)
          .find(([, n]) => n.toLowerCase() === name.toLowerCase())?.[0])
        .filter(Boolean)
        .map(Number);
      if (genreIds.length) params.with_genres = genreIds;
    }
    
    if (input.year) {
      params["primary_release_date.gte"] = `${input.year}-01-01`;
      params["primary_release_date.lte"] = `${input.year}-12-31`;
    }
    
    if (input.minRating) params["vote_average.gte"] = input.minRating;
    if (input.language) params.with_original_language = input.language;
    if (input.sortBy) params.sort_by = input.sortBy;
    
    const result = await discoverMoviesAction(params);
    
    // Return summarized results for the LLM
    return JSON.stringify({
      totalResults: result.totalResults,
      movies: result.results.slice(0, 10).map(m => ({
        id: m.id,
        title: m.title,
        year: m.release_date?.slice(0, 4),
        rating: m.vote_average?.toFixed(1),
        overview: m.overview?.slice(0, 200),
        genres: m.genres?.map(g => g.name).join(", "),
      })),
    });
  },
  {
    name: "discover_movies",
    description: `Discover movies based on filters like genre, year, rating, etc.
Use this when the user wants to find movies matching specific criteria.
Returns up to 10 movies with basic info.`,
    schema: z.object({
      genres: z.array(z.string()).optional()
        .describe("Genre names like 'Action', 'Comedy', 'Horror'"),
      year: z.number().optional()
        .describe("Release year (e.g., 2024)"),
      minRating: z.number().min(0).max(10).optional()
        .describe("Minimum TMDB rating (0-10)"),
      language: z.string().optional()
        .describe("Original language code (e.g., 'en', 'ko', 'ja')"),
      sortBy: z.enum([
        "popularity.desc",
        "vote_average.desc",
        "primary_release_date.desc",
        "revenue.desc",
      ]).optional()
        .describe("Sort order for results"),
    }),
  }
);

export const discoverSeriesTool = tool(
  async (input) => {
    const params: Record<string, unknown> = {
      page: 1,
      "vote_count.gte": 50,
    };
    
    if (input.genres?.length) {
      const genreIds = input.genres
        .map(name => Object.entries(TV_GENRES)
          .find(([, n]) => n.toLowerCase().includes(name.toLowerCase()))?.[0])
        .filter(Boolean)
        .map(Number);
      if (genreIds.length) params.with_genres = genreIds;
    }
    
    if (input.year) {
      params["first_air_date.gte"] = `${input.year}-01-01`;
      params["first_air_date.lte"] = `${input.year}-12-31`;
    }
    
    if (input.minRating) params["vote_average.gte"] = input.minRating;
    if (input.status) params.with_status = input.status;
    
    const result = await discoverTVAction(params);
    
    return JSON.stringify({
      totalResults: result.totalResults,
      series: result.results.slice(0, 10).map(s => ({
        id: s.id,
        name: s.name,
        year: s.first_air_date?.slice(0, 4),
        rating: s.vote_average?.toFixed(1),
        overview: s.overview?.slice(0, 200),
        genres: s.genres?.map(g => g.name).join(", "),
      })),
    });
  },
  {
    name: "discover_series",
    description: `Discover TV series based on filters.
Use this when the user wants to find TV shows matching specific criteria.`,
    schema: z.object({
      genres: z.array(z.string()).optional()
        .describe("Genre names like 'Drama', 'Comedy', 'Sci-Fi'"),
      year: z.number().optional()
        .describe("First air date year"),
      minRating: z.number().min(0).max(10).optional()
        .describe("Minimum TMDB rating"),
      status: z.enum(["Returning Series", "Ended", "Canceled"]).optional()
        .describe("Show status filter"),
    }),
  }
);
```

```typescript
// src/server/ai/tools/search.ts
import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { search } from "@/server/actions/search";

export const searchTool = tool(
  async (input) => {
    const result = await search({ query: input.query, page: 1 });
    
    // Combine and summarize results
    const items = result.results.slice(0, 8).map(item => {
      if (item.media_type === "movie") {
        return {
          type: "movie",
          id: item.id,
          title: item.title,
          year: item.release_date?.slice(0, 4),
          rating: item.vote_average?.toFixed(1),
        };
      } else if (item.media_type === "tv") {
        return {
          type: "series",
          id: item.id,
          name: item.name,
          year: item.first_air_date?.slice(0, 4),
          rating: item.vote_average?.toFixed(1),
        };
      } else {
        return {
          type: "person",
          id: item.id,
          name: item.name,
          knownFor: item.known_for_department,
        };
      }
    });
    
    return JSON.stringify({
      query: input.query,
      totalResults: result.total_results,
      results: items,
    });
  },
  {
    name: "search_movies",
    description: `Search for movies, TV shows, and people by name.
Use this when the user mentions a specific title or person.`,
    schema: z.object({
      query: z.string().describe("Search query (movie/show title or person name)"),
    }),
  }
);
```

```typescript
// src/server/ai/tools/navigation.ts
import { tool } from "@langchain/core/tools";
import { z } from "zod";

// This tool doesn't actually navigate - it returns a navigation intent
// that the client will handle
export const navigateTool = tool(
  async (input) => {
    // Build the path
    let path: string;
    switch (input.type) {
      case "movie":
        path = `/movie/${input.id}`;
        break;
      case "series":
        path = `/series/${input.id}`;
        break;
      case "person":
        path = `/person/${input.id}`;
        break;
      case "browse":
        path = "/browse";
        break;
      case "topics":
        path = "/topics";
        break;
      default:
        path = "/";
    }
    
    // Return as JSON for the agent to include in response
    return JSON.stringify({
      action: "navigate",
      path,
      id: input.id,
      type: input.type,
    });
  },
  {
    name: "navigate_to",
    description: `Navigate the user to a specific page in the app.
Use this when you want to take the user to a movie/series detail page, browse page, etc.
The navigation will be triggered after your response.`,
    schema: z.object({
      type: z.enum(["movie", "series", "person", "browse", "topics"])
        .describe("Type of page to navigate to"),
      id: z.number().optional()
        .describe("ID of the movie/series/person (required for detail pages)"),
    }),
  }
);
```

### 1.5 LangGraph Agent

```typescript
// src/server/ai/agent.ts
import { StateGraph } from "@langchain/langgraph";
import { ToolNode } from "@langchain/langgraph/prebuilt";
import { AIMessage, HumanMessage, SystemMessage } from "@langchain/core/messages";
import { AgentState, type AgentStateType } from "./state";
import { createBedrockChat } from "./bedrock";
import { searchTool } from "./tools/search";
import { discoverMoviesTool, discoverSeriesTool } from "./tools/discover";
import { navigateTool } from "./tools/navigation";
import { SYSTEM_PROMPT } from "./prompts/system";

// All available tools
const tools = [
  searchTool,
  discoverMoviesTool,
  discoverSeriesTool,
  navigateTool,
];

// Create model with tools bound
function createModel() {
  const model = createBedrockChat();
  return model.bindTools(tools);
}

// Agent node - decides what to do next
async function agentNode(state: AgentStateType) {
  const model = createModel();
  
  // Add system message if not present
  const messages = state.messages[0]?.constructor === SystemMessage
    ? state.messages
    : [new SystemMessage(SYSTEM_PROMPT), ...state.messages];
  
  const response = await model.invoke(messages);
  
  return { messages: [response] };
}

// Check if we should continue to tools or end
function shouldContinue(state: AgentStateType) {
  const lastMessage = state.messages[state.messages.length - 1];
  
  // If there are tool calls, route to tools
  if (lastMessage instanceof AIMessage && lastMessage.tool_calls?.length) {
    return "tools";
  }
  
  // Otherwise, end
  return "end";
}

// Build the graph
export function createMovieAgent() {
  const toolNode = new ToolNode(tools);
  
  const graph = new StateGraph(AgentState)
    .addNode("agent", agentNode)
    .addNode("tools", toolNode)
    .addEdge("__start__", "agent")
    .addConditionalEdges("agent", shouldContinue, {
      tools: "tools",
      end: "__end__",
    })
    .addEdge("tools", "agent");
  
  return graph.compile();
}

// Main invocation function
export async function invokeAgent(
  message: string,
  userId?: string | null,
  conversationHistory?: BaseMessage[]
) {
  const agent = createMovieAgent();
  
  const initialState = {
    messages: [
      ...(conversationHistory || []),
      new HumanMessage(message),
    ],
    userId: userId ?? null,
  };
  
  const result = await agent.invoke(initialState);
  
  return result;
}

// Streaming invocation
export async function* streamAgent(
  message: string,
  userId?: string | null,
  conversationHistory?: BaseMessage[]
) {
  const agent = createMovieAgent();
  
  const initialState = {
    messages: [
      ...(conversationHistory || []),
      new HumanMessage(message),
    ],
    userId: userId ?? null,
  };
  
  const stream = await agent.stream(initialState, {
    streamMode: "messages",
  });
  
  for await (const chunk of stream) {
    yield chunk;
  }
}
```

### 1.6 System Prompt

The system prompt defines a fun, witty, slightly sassy personality - like a movie-obsessed friend:

```typescript
// src/server/ai/prompts/system.ts - Key sections

// Personality
- **Enthusiastic but not annoying** - you love movies, let it show
- **Playfully opinionated** - have hot takes, be a little sassy
- **Conversational** - talk like a friend, not a search engine
- **Brief** - poster cards do the heavy lifting, keep text snappy
- **Creative descriptions** - make each pick sound irresistible

// Example vibes:
- "Oh, you want chaos? I've got chaos."
- "This one's a slow burn but trust me, worth it."
- "If you haven't seen this, we need to talk."

// Internal Context (hidden from users)
This app uses TMDB (The Movie Database) for all movie/series data.
Never reveal technical details like "TMDB", "API", "database", or "IDs" to users.

// CRITICAL: ID Handling
- Tool gave you an ID? Use it
- Suggesting from general knowledge? SKIP the ID: [MOVIE::Title]
- NEVER guess/invent IDs - the server auto-resolves titles
```

See `src/server/ai/prompts/system.ts` for the full prompt.

### 1.7 API Route

```typescript
// src/app/api/ai/chat/route.ts
import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { streamAgent } from "@/server/ai/agent";
import { HumanMessage, AIMessage } from "@langchain/core/messages";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    const { message, history } = await request.json();
    
    if (!message?.trim()) {
      return new Response("Message is required", { status: 400 });
    }
    
    // Convert history to LangChain messages
    const conversationHistory = (history || []).map((msg: { role: string; content: string }) => {
      if (msg.role === "user") {
        return new HumanMessage(msg.content);
      }
      return new AIMessage(msg.content);
    });
    
    // Create streaming response
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        try {
          const agentStream = streamAgent(
            message,
            session?.user?.id ?? null,
            conversationHistory
          );
          
          for await (const chunk of agentStream) {
            // Format as SSE
            const data = JSON.stringify(chunk);
            controller.enqueue(encoder.encode(`data: ${data}\n\n`));
          }
          
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          controller.close();
        } catch (error) {
          console.error("Agent stream error:", error);
          controller.error(error);
        }
      },
    });
    
    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
      },
    });
  } catch (error) {
    console.error("AI chat error:", error);
    return new Response("Internal server error", { status: 500 });
  }
}
```

---

## Phase 2: User Context Integration

**Goal:** Integrate user watchlist, ratings, and watched history to personalize recommendations.

### 2.1 User Data Tools

```typescript
// src/server/ai/tools/user-data.ts
import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { connectDB } from "@/server/db";
import { WatchedMovie, MoviesWatchlist, SeriesWatchlist, UserRating } from "@/server/db/models/user-library";
import { getUserIdForDb } from "@/lib/user-id";

export const getUserWatchlistTool = tool(
  async (input, config) => {
    const userId = config?.configurable?.userId;
    if (!userId) {
      return JSON.stringify({ error: "User not logged in", items: [] });
    }
    
    await connectDB();
    const numericUserId = getUserIdForDb(userId);
    
    const [movies, series] = await Promise.all([
      MoviesWatchlist.find({ userId: numericUserId })
        .sort({ createdAt: -1 })
        .limit(20)
        .lean(),
      SeriesWatchlist.find({ userId: numericUserId })
        .sort({ createdAt: -1 })
        .limit(20)
        .lean(),
    ]);
    
    return JSON.stringify({
      movies: movies.map(m => ({ id: m.movieId, addedAt: m.createdAt })),
      series: series.map(s => ({ id: s.seriesId, addedAt: s.createdAt })),
      totalMovies: movies.length,
      totalSeries: series.length,
    });
  },
  {
    name: "get_user_watchlist",
    description: `Get the user's watchlist (movies and series they want to watch).
Use this to understand what the user is interested in watching.
Returns IDs only - use search or details tools to get more info about specific items.`,
    schema: z.object({}),
  }
);

export const getUserRatingsTool = tool(
  async (input, config) => {
    const userId = config?.configurable?.userId;
    if (!userId) {
      return JSON.stringify({ error: "User not logged in", ratings: [] });
    }
    
    await connectDB();
    const numericUserId = getUserIdForDb(userId);
    
    const ratings = await UserRating.find({ userId: numericUserId })
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();
    
    const liked = ratings.filter(r => r.rating === 1);
    const disliked = ratings.filter(r => r.rating === -1);
    
    return JSON.stringify({
      liked: liked.map(r => ({ id: r.itemId, type: r.itemType })),
      disliked: disliked.map(r => ({ id: r.itemId, type: r.itemType })),
      totalLiked: liked.length,
      totalDisliked: disliked.length,
    });
  },
  {
    name: "get_user_ratings",
    description: `Get the user's liked and disliked movies/series.
Use this to understand user preferences and avoid recommending disliked content.
IMPORTANT: Never recommend items the user has disliked.`,
    schema: z.object({}),
  }
);

export const getUserWatchedTool = tool(
  async (input, config) => {
    const userId = config?.configurable?.userId;
    if (!userId) {
      return JSON.stringify({ error: "User not logged in", movies: [] });
    }
    
    await connectDB();
    const numericUserId = getUserIdForDb(userId);
    
    const watched = await WatchedMovie.find({ userId: numericUserId })
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();
    
    return JSON.stringify({
      movies: watched.map(w => ({ id: w.movieId, watchedAt: w.createdAt })),
      total: watched.length,
    });
  },
  {
    name: "get_user_watched",
    description: `Get movies the user has already watched.
Use this to avoid recommending content they've already seen.`,
    schema: z.object({}),
  }
);
```

### 2.2 Enhanced System Prompt with User Context

```typescript
// src/server/ai/prompts/system.ts
export function getSystemPrompt(hasUser: boolean) {
  const basePrompt = `You are a friendly movie recommendation assistant...`;
  
  if (hasUser) {
    return `${basePrompt}

## User Personalization
The user is logged in. You have access to their:
- **Watchlist**: Movies/series they want to watch
- **Ratings**: Items they've liked (👍) or disliked (👎)
- **Watched History**: Movies they've already seen

### Personalization Guidelines
1. ALWAYS check ratings before recommending - never suggest disliked items
2. Don't recommend items already on their watchlist (they already know about them)
3. Don't recommend movies they've already watched
4. Use their liked items to understand their taste
5. If they ask "what should I watch?", check their watchlist first`;
  }
  
  return `${basePrompt}

## Guest User
The user is not logged in. Encourage them to sign in to get personalized recommendations based on their watchlist and ratings.`;
}
```

---

## Phase 3: UI Implementation

**Goal:** Create the animated assistant UI component.

### 3.1 Assistant Floaty Component

```tsx
// src/components/features/ai/assistant-floaty.tsx
"use client";

import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Sparkles, X, Send, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { useChatStream } from "@/hooks/use-chat-stream";
import { ChatMessage } from "./chat-message";
import { RecommendationCards } from "./recommendation-cards";

// Attention-grabbing messages that rotate
const IDLE_MESSAGES = [
  "🎬 Need help finding something to watch?",
  "🍿 Looking for your next favorite movie?",
  "✨ Ask me for personalized recommendations!",
  "🎭 What genre are you in the mood for?",
  "🌟 I can help you discover hidden gems!",
];

interface AssistantFloatyProps {
  className?: string;
}

export function AssistantFloaty({ className }: AssistantFloatyProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [idleMessageIndex, setIdleMessageIndex] = useState(0);
  const [input, setInput] = useState("");
  
  const {
    messages,
    isLoading,
    recommendations,
    sendMessage,
    clearMessages,
  } = useChatStream();
  
  // Rotate idle messages
  useEffect(() => {
    if (isOpen) return;
    
    const interval = setInterval(() => {
      setIdleMessageIndex((i) => (i + 1) % IDLE_MESSAGES.length);
    }, 4000);
    
    return () => clearInterval(interval);
  }, [isOpen]);
  
  const handleSend = useCallback(() => {
    if (!input.trim() || isLoading) return;
    sendMessage(input);
    setInput("");
  }, [input, isLoading, sendMessage]);
  
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };
  
  return (
    <div className={cn("fixed bottom-6 left-1/2 -translate-x-1/2 z-50", className)}>
      <AnimatePresence mode="wait">
        {!isOpen ? (
          // Idle bubble
          <motion.button
            key="idle"
            initial={{ opacity: 0, y: 20, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.95 }}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => setIsOpen(true)}
            className={cn(
              "flex items-center gap-3 px-5 py-3 rounded-full",
              "bg-gradient-to-r from-violet-600 to-purple-600",
              "text-white font-medium shadow-lg shadow-purple-500/25",
              "hover:shadow-purple-500/40 transition-shadow"
            )}
          >
            <motion.div
              animate={{ rotate: [0, 15, -15, 0] }}
              transition={{ duration: 2, repeat: Infinity, repeatDelay: 3 }}
            >
              <Sparkles className="h-5 w-5" />
            </motion.div>
            <motion.span
              key={idleMessageIndex}
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-sm"
            >
              {IDLE_MESSAGES[idleMessageIndex]}
            </motion.span>
          </motion.button>
        ) : (
          // Chat panel
          <motion.div
            key="chat"
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.95 }}
            className={cn(
              "bg-background border rounded-2xl shadow-2xl overflow-hidden",
              "w-[380px] sm:w-[440px]",
              isExpanded ? "h-[600px]" : "h-[400px]",
              "flex flex-col transition-all duration-300"
            )}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b bg-muted/30">
              <div className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-purple-500" />
                <span className="font-medium">Movie Assistant</span>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setIsExpanded(!isExpanded)}
                  className="p-1.5 rounded-lg hover:bg-muted transition-colors"
                >
                  <ChevronDown className={cn(
                    "h-4 w-4 transition-transform",
                    isExpanded && "rotate-180"
                  )} />
                </button>
                <button
                  onClick={() => {
                    setIsOpen(false);
                    clearMessages();
                  }}
                  className="p-1.5 rounded-lg hover:bg-muted transition-colors"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
            
            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {messages.length === 0 ? (
                <div className="text-center text-muted-foreground py-8">
                  <p>Hi! I&apos;m your movie assistant 🎬</p>
                  <p className="text-sm mt-1">
                    Ask me for recommendations, search for movies, or tell me what you&apos;re in the mood for!
                  </p>
                </div>
              ) : (
                messages.map((msg, i) => (
                  <ChatMessage key={i} message={msg} isLoading={isLoading && i === messages.length - 1} />
                ))
              )}
              
              {/* Recommendation cards */}
              {recommendations.length > 0 && (
                <RecommendationCards items={recommendations} />
              )}
            </div>
            
            {/* Input */}
            <div className="p-3 border-t">
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Ask me anything about movies..."
                  disabled={isLoading}
                  className={cn(
                    "flex-1 px-4 py-2.5 rounded-xl bg-muted/50",
                    "placeholder:text-muted-foreground/60",
                    "focus:outline-none focus:ring-2 focus:ring-purple-500/50",
                    "disabled:opacity-50"
                  )}
                />
                <button
                  onClick={handleSend}
                  disabled={isLoading || !input.trim()}
                  className={cn(
                    "p-2.5 rounded-xl",
                    "bg-gradient-to-r from-violet-600 to-purple-600",
                    "text-white disabled:opacity-50",
                    "hover:shadow-lg hover:shadow-purple-500/25 transition-shadow"
                  )}
                >
                  <Send className="h-4 w-4" />
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
```

### 3.2 Chat Stream Hook

```typescript
// src/hooks/use-chat-stream.ts
"use client";

import { useState, useCallback, useRef } from "react";
import type { AgentMediaItem } from "@/server/ai/state";
import { useRouter } from "next/navigation";

interface Message {
  role: "user" | "assistant";
  content: string;
}

export function useChatStream() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [recommendations, setRecommendations] = useState<AgentMediaItem[]>([]);
  const router = useRouter();
  const abortControllerRef = useRef<AbortController | null>(null);
  
  const sendMessage = useCallback(async (content: string) => {
    // Add user message
    setMessages((prev) => [...prev, { role: "user", content }]);
    setIsLoading(true);
    setRecommendations([]);
    
    // Abort previous request if any
    abortControllerRef.current?.abort();
    abortControllerRef.current = new AbortController();
    
    try {
      const response = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: content,
          history: messages,
        }),
        signal: abortControllerRef.current.signal,
      });
      
      if (!response.ok) throw new Error("Failed to send message");
      
      const reader = response.body?.getReader();
      if (!reader) throw new Error("No response body");
      
      const decoder = new TextDecoder();
      let assistantContent = "";
      
      // Add empty assistant message
      setMessages((prev) => [...prev, { role: "assistant", content: "" }]);
      
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        const chunk = decoder.decode(value);
        const lines = chunk.split("\n");
        
        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const data = line.slice(6);
            if (data === "[DONE]") continue;
            
            try {
              const parsed = JSON.parse(data);
              
              // Handle streaming message content
              if (parsed.content) {
                assistantContent += parsed.content;
                setMessages((prev) => {
                  const updated = [...prev];
                  updated[updated.length - 1] = {
                    role: "assistant",
                    content: assistantContent,
                  };
                  return updated;
                });
              }
              
              // Handle recommendations
              if (parsed.recommendations) {
                setRecommendations(parsed.recommendations);
              }
              
              // Handle navigation
              if (parsed.navigation) {
                router.push(parsed.navigation.path);
              }
            } catch {
              // Ignore parse errors
            }
          }
        }
      }
    } catch (error) {
      if ((error as Error).name !== "AbortError") {
        console.error("Chat error:", error);
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: "Sorry, something went wrong. Please try again." },
        ]);
      }
    } finally {
      setIsLoading(false);
    }
  }, [messages, router]);
  
  const clearMessages = useCallback(() => {
    setMessages([]);
    setRecommendations([]);
  }, []);
  
  return {
    messages,
    isLoading,
    recommendations,
    sendMessage,
    clearMessages,
  };
}
```

---

## Phase 4: Advanced Features

**Goal:** Add sophisticated recommendation capabilities.

### 4.1 Contextual Recommendations Based on Current Page

```typescript
// src/server/ai/tools/context.ts
import { tool } from "@langchain/core/tools";
import { z } from "zod";

export const getPageContextTool = tool(
  async (input) => {
    // This will be populated by the client
    return JSON.stringify({
      currentPage: input.page,
      currentItemId: input.itemId,
      currentItemType: input.itemType,
    });
  },
  {
    name: "get_page_context",
    description: `Get information about the current page the user is viewing.
Use this to provide contextual recommendations.`,
    schema: z.object({
      page: z.string().describe("Current page path"),
      itemId: z.number().optional().describe("Current item ID if on a detail page"),
      itemType: z.enum(["movie", "series", "person"]).optional(),
    }),
  }
);
```

### 4.2 Similar/Related Content Tool

```typescript
// src/server/ai/tools/related.ts
import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { getMovieDetails, getSeriesDetails } from "@/server/services/tmdb";

export const getRelatedContentTool = tool(
  async (input) => {
    if (input.type === "movie") {
      const movie = await getMovieDetails(input.id);
      const similar = (movie.similar as { results: unknown[] })?.results || [];
      const recommendations = (movie.recommendations as { results: unknown[] })?.results || [];
      
      return JSON.stringify({
        similar: similar.slice(0, 5).map((m: Record<string, unknown>) => ({
          id: m.id,
          title: m.title,
          rating: (m.vote_average as number)?.toFixed(1),
        })),
        recommendations: recommendations.slice(0, 5).map((m: Record<string, unknown>) => ({
          id: m.id,
          title: m.title,
          rating: (m.vote_average as number)?.toFixed(1),
        })),
      });
    } else {
      const series = await getSeriesDetails(input.id);
      const similar = (series.similar as { results: unknown[] })?.results || [];
      const recommendations = (series.recommendations as { results: unknown[] })?.results || [];
      
      return JSON.stringify({
        similar: similar.slice(0, 5).map((s: Record<string, unknown>) => ({
          id: s.id,
          name: s.name,
          rating: (s.vote_average as number)?.toFixed(1),
        })),
        recommendations: recommendations.slice(0, 5).map((s: Record<string, unknown>) => ({
          id: s.id,
          name: s.name,
          rating: (s.vote_average as number)?.toFixed(1),
        })),
      });
    }
  },
  {
    name: "get_related_content",
    description: `Get similar and recommended content for a specific movie or series.
Use this when the user asks for something "like" a specific title.`,
    schema: z.object({
      id: z.number().describe("Movie or series ID"),
      type: z.enum(["movie", "series"]).describe("Content type"),
    }),
  }
);
```

---

## Phase 5: Future Enhancements (Vector DB)

**Goal:** Integrate vector database for semantic search and improved recommendations.

### 5.1 Architecture Addition

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         Vector Database Layer                                │
├─────────────────────────────────────────────────────────────────────────────┤
│  Pinecone / Weaviate / pgvector                                             │
│  ├── Movie embeddings (title + overview + genres)                           │
│  ├── User preference embeddings (based on ratings)                          │
│  └── Semantic search capabilities                                            │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 5.2 Semantic Search Tool (Future)

```typescript
// src/server/ai/tools/semantic-search.ts (future)
export const semanticSearchTool = tool(
  async (input) => {
    // 1. Generate embedding for user query
    // 2. Search vector DB for similar movies
    // 3. Filter by user preferences
    // 4. Return ranked results
  },
  {
    name: "semantic_search",
    description: `Search for movies/series using natural language.
Unlike keyword search, this understands concepts like "feel-good movies about friendship" 
or "dark psychological thrillers with plot twists".`,
    schema: z.object({
      query: z.string().describe("Natural language description of what to find"),
      type: z.enum(["movie", "series", "both"]).optional(),
      limit: z.number().min(1).max(20).default(10),
    }),
  }
);
```

---

## Implementation Checklist

### Phase 1: Core Agent Infrastructure ✅ COMPLETE
- [x] Install dependencies (@langchain/core, @langchain/langgraph, @langchain/aws)
- [x] Set up AWS credentials in template.env
- [x] Create agent state definition (`src/server/ai/state.ts`)
- [x] Implement Bedrock client (`src/server/ai/bedrock.ts`)
- [x] Create search tool (`src/server/ai/tools/search.ts`)
- [x] Create discover tools (`src/server/ai/tools/discover.ts`)
- [x] Create trending tool (`src/server/ai/tools/trending.ts`)
- [x] Create navigation tool (`src/server/ai/tools/navigation.ts`)
- [x] Build LangGraph StateGraph (`src/server/ai/agent.ts`)
- [x] Create API route with streaming (`src/app/api/ai/chat/route.ts`)
- [x] Create test script (`scripts/test-ai-agent.ts`)
- [x] Test basic agent functionality with Amazon Nova Pro

### Phase 2: User Context Integration ✅ COMPLETE
- [x] Create user watchlist tool (`src/server/ai/tools/user-data.ts`)
- [x] Create user ratings tool
- [x] Create user watched tool
- [x] Update system prompt for personalization
- [x] Pass userId through agent config (via RunnableConfig)
- [x] Update test script with --user flag for testing
- [ ] Test personalized recommendations (requires MongoDB connection)

### Phase 3: UI Implementation ✅ COMPLETE
- [x] Create AssistantFloaty component (`src/components/features/ai/assistant-floaty.tsx`)
- [x] Implement useChatStream hook (`src/hooks/use-chat-stream.ts`)
- [x] Add to app layout (via Providers component)
- [x] Test UI interactions
- [x] Add animations and polish

**Note:** Streaming temporarily disabled due to Amazon Nova Pro tool call compatibility issues with LangChain. Using non-streaming mode with SSE wrapper for now. TODO: Re-enable streaming when LangChain AWS fixes Nova Pro support.

### Phase 4: Advanced Features ✅ COMPLETE
- [x] Add page context tool (`src/server/ai/tools/context.ts`)
- [x] Add related content tool (`src/server/ai/tools/related.ts`)
- [x] Update system prompt with new tool guidance
- [x] Pass pageContext through agent state
- [x] Update useChatStream to send page context
- [x] Update AssistantFloaty with itemContext prop for detail pages

### Phase 5: UI Overhaul ✅ COMPLETE
Complete redesign of the assistant UI for a minimal, non-intrusive experience:

- [x] **Idle State**: Floating circle with periodic prompt pills
- [x] **Minimal State**: Cards + text only, no chat chrome
  - Poster cards container with solid black bg + white border + shadow falloff
  - Text/input container separate, also with solid black bg + shadow (pushed down)
  - Two distinct containers that smoothly blend into page via box shadows
  - Controls appear on hover (input, expand, close)
- [x] **Expanded State**: Full chat overlay for history
- [x] **Media Tag System**: Agent uses `[MOVIE:id:title|desc]` tags (NO backticks!)
- [x] **Tag Parser**: `src/lib/ai/parse-media-tags.ts` extracts structured data
- [x] **Poster Cards**: Rich cards from tags with 3-line descriptions
- [x] **System Prompt Update**: Explicit instruction to NOT use backticks around tags
- [x] **Text Cleanup**: Strips backticks, trailing commas/colons from displayed text
- [x] Removed deprecated ChatMessage and RecommendationCards components

### Phase 6.5: Multi-Model Support ✅ COMPLETE
- [x] Support for reasoning models (Kimi K2)
- [x] Handle `reasoning_content` response format
- [x] Skip tool-call messages in response extraction
- [x] Fallback to reasoning content when no text block
- [x] Filter reasoning blocks during streaming
- [x] Update documentation and rules

### Phase 6.6: Personality & ID Safety ✅ COMPLETE
- [x] Updated system prompt with fun/sassy/witty personality
- [x] Added internal TMDB context (hidden from users)
- [x] Strengthened ID handling rules with clear warnings
- [x] Fixed null ID handling in all UI components
  - PosterCardLarge: fallback to search URL
  - MediaChip: fallback to search URL
  - Key generation: use title+index for uniqueness
  - collectMediaTags: dedupe by title when no ID
- [x] Updated rules and documentation

### Phase 7: Detail Tools ✅ COMPLETE
Add tools for fetching specific movie/series/person details. Critical for answering "Is X good?", "Who's in X?", "Where can I watch X?" queries.

**Design Principle:** Tool responses should be LEAN - only data the agent needs for conversation. No poster URLs, no backdrop paths, no production company IDs.

#### 7.1 Movie Details Tool
```typescript
// src/server/ai/tools/details.ts
get_movie_details(id: number)

// Returns (lightweight):
{
  id: 550,
  title: "Fight Club",
  year: "1999",
  runtime: 139,           // minutes
  rating: "8.4",
  voteCount: 27000,
  certification: "R",     // MPAA rating
  overview: "A depressed man...", // truncated to 300 chars
  genres: ["Drama", "Thriller"],
  director: "David Fincher",
  topCast: ["Brad Pitt", "Edward Norton", "Helena Bonham Carter"],
  streaming: {            // user's region only
    flatrate: ["Netflix", "Hulu"],
    rent: ["Apple TV", "Prime Video"],
    buy: ["Apple TV"]
  },
  watchLinks: [           // direct links with deep link flag
    { provider: "Netflix", type: "flatrate", link: "https://...", hasDeepLink: true },
    { provider: "Apple TV", type: "rent", link: "https://...", hasDeepLink: false }
  ],
  inWatchlist: true,      // if user logged in
  isWatched: false,
  userRating: 1           // 1=liked, -1=disliked, null=not rated
}
```

#### 7.2 Series Details Tool
```typescript
get_series_details(id: number)

// Returns:
{
  id: 1396,
  name: "Breaking Bad",
  year: "2008",
  status: "Ended",        // or "Returning Series", "Canceled"
  seasons: 5,
  episodes: 62,
  rating: "9.5",
  certification: "TV-MA",
  overview: "...",
  genres: ["Drama", "Crime"],
  creators: ["Vince Gilligan"],
  topCast: ["Bryan Cranston", "Aaron Paul"],
  streaming: { flatrate: [...], rent: [...], buy: [...] },
  watchLinks: [           // direct links with deep link flag
    { provider: "Netflix", type: "flatrate", link: "https://...", hasDeepLink: true }
  ],
  inWatchlist: true,
  userRating: 1
}
```

#### 7.3 Person Details Tool
```typescript
get_person(idOrName: number | string)

// Can search by name OR use ID directly
// Returns:
{
  id: 287,
  name: "Brad Pitt",
  knownFor: "Acting",
  age: 60,                // calculated from birthday
  bio: "...",             // truncated to 300 chars
  notableMovies: [        // top 5 by popularity
    { id: 550, title: "Fight Club", year: "1999", role: "Tyler Durden" },
    { id: 16869, title: "Inglourious Basterds", year: "2009", role: "Lt. Aldo Raine" }
  ],
  notableSeries: [...],   // if any
  recentWork: [...]       // last 3 years
}
```

#### 7.4 Upcoming/Now Playing Tool
```typescript
get_upcoming(mediaType: "movie" | "tv", timeframe?: "week" | "month")

// Returns:
{
  upcoming: [             // next 10 releases
    { id: 123, title: "Dune 3", releaseDate: "2026-03-15", genres: ["Sci-Fi"] }
  ],
  nowPlaying: [           // currently in theaters / airing
    { id: 456, title: "...", releaseDate: "..." }
  ]
}
```

#### 7.5 Trailers Tool
```typescript
get_videos(id: number, mediaType: "movie" | "series")

// Returns:
{
  trailers: [
    { name: "Official Trailer", youtubeKey: "abc123" },
    { name: "Teaser", youtubeKey: "def456" }
  ],
  clips: [...]  // if any, max 3
}
```

#### Shared Utilities (✅ Created)

A new shared utility module has been created for fetching enriched media data:

```typescript
// src/server/utils/media-data.ts
import {
  getCountryCode,
  getLightMovieDetails,
  getLightSeriesDetails,
  getLightPersonDetails,
  searchPersonAndGetDetails,
} from "@/server/utils";

// Combines MongoDB enriched data + TMDB fresh data:
// - Multi-source ratings (TMDB, IMDb, RT, Google)
// - Deep watch links (India) with TMDB fallback
// - Certification/age ratings
// - Truncated overviews, top cast names only
```

**Key Features:**
- `getCountryCode()` - Extracts country from request headers (canonical source, used by all actions)
- `getLightMovieDetails(id, countryCode)` - Certification, multi-source ratings, streaming + watchLinks
- `getLightSeriesDetails(id, countryCode)` - TV ratings (TV-MA, etc.), streaming + watchLinks
- `getLightPersonDetails(id)` - Filmography with notable/recent work
- `searchPersonAndGetDetails(name)` - Search + fetch in one call
- Falls back to TMDB when MongoDB data unavailable

**Watch Links Response Structure:**
```typescript
{
  streaming: {
    flatrate: ["Netflix", "Hulu"],    // Subscription services
    rent: ["Apple TV", "Prime Video"], // Rental options
    buy: ["Apple TV"]                   // Purchase options
  },
  watchLinks: [
    { provider: "Netflix", type: "flatrate", link: "https://...", hasDeepLink: true },
    { provider: "Apple TV", type: "rent", link: "https://...", hasDeepLink: false }
  ]
}
```
- **hasDeepLink: true** - Direct player URL (India, scraped via Lambda)
- **hasDeepLink: false** - JustWatch attribution link (all other regions)

#### Implementation Tasks
- [x] Create `src/server/ai/tools/details.ts` using `getLightMovieDetails`/`getLightSeriesDetails`
- [x] Create `src/server/ai/tools/person.ts` using `getLightPersonDetails`
- [x] Create `src/server/ai/tools/upcoming.ts` (use existing TMDB `getUpcomingMovies`)
- [x] Create `src/server/ai/tools/videos.ts`
- [x] ~~Add `certification` extraction from TMDB~~ (done in media-data.ts)
- [x] ~~Helper to get streaming for user's region~~ (done in media-data.ts)
- [x] Helper to check user's watchlist/watched/ratings status (in details.ts)
- [x] Add tools to agent graph (via tools/index.ts)
- [x] Update system prompt with usage guidance
- [x] Add `watchLinks` with `hasDeepLink` flag (India deep links vs TMDB fallback)
- [x] Consolidate `getCountryCode()` to single source in `media-data.ts`

---

### Phase 8: Enhanced Discover ✅ COMPLETE
Extend discover tool with exclusions, AND/OR logic, and certification filters.

#### 8.1 TMDB Filter Logic
TMDB discover API supports:
- **Comma-separated = AND** (all must match): `with_genres=28,35` = Action AND Comedy
- **Pipe-separated = OR** (any can match): `with_genres=28|35` = Action OR Comedy
- **Exclusions**: `without_genres`, `without_keywords`, `without_companies`

#### 8.2 New Schema Fields
```typescript
// Add to discover schema:

// Exclusions
withoutGenres: z.array(z.string()).optional()
  .describe("Genres to EXCLUDE (e.g., 'Horror' to avoid scary movies)"),
withoutCastNames: z.array(z.string()).optional()
  .describe("Actors to exclude (e.g., 'Nicolas Cage')"),
withoutCrewNames: z.array(z.string()).optional()
  .describe("Directors/writers to exclude"),
withoutKeywordNames: z.array(z.string()).optional()
  .describe("Themes to exclude (e.g., 'gore', 'violence')"),

// AND/OR logic
genreMode: z.enum(["and", "or"]).default("and")
  .describe("'and' = must match ALL genres, 'or' = match ANY genre"),
keywordMode: z.enum(["and", "or"]).default("or")
  .describe("'and' = must have ALL keywords, 'or' = have ANY keyword"),
castMode: z.enum(["and", "or"]).default("or")
  .describe("'and' = must have ALL actors, 'or' = have ANY actor"),

// Age rating / Certification
certification: z.enum(["G", "PG", "PG-13", "R", "NC-17"]).optional()
  .describe("MPAA rating (for movies). Use for family-friendly filtering"),
certificationLte: z.enum(["G", "PG", "PG-13", "R", "NC-17"]).optional()
  .describe("Max certification (e.g., 'PG-13' includes G, PG, PG-13)"),
tvRating: z.enum(["TV-Y", "TV-Y7", "TV-G", "TV-PG", "TV-14", "TV-MA"]).optional()
  .describe("TV content rating"),
```

#### 8.3 Implementation Details
```typescript
// Helper to format filter arrays with AND/OR
function formatFilter(ids: number[], mode: "and" | "or"): string {
  return mode === "and" ? ids.join(",") : ids.join("|");
}

// Certification requires special handling
// For movies: Use certification_country=US and certification
// For TV: Use with_watch_providers approach or content_ratings
```

#### 8.4 Common Use Cases
```typescript
// "Family-friendly action movies"
discover({ genres: ["Action"], certificationLte: "PG-13" })

// "Comedies without Adam Sandler"
discover({ genres: ["Comedy"], withoutCastNames: ["Adam Sandler"] })

// "Sci-fi OR Fantasy movies"
discover({ genres: ["Sci-Fi", "Fantasy"], genreMode: "or" })

// "Movies with BOTH Tom Hanks AND Meg Ryan"
discover({ castNames: ["Tom Hanks", "Meg Ryan"], castMode: "and" })

// "Thrillers without gore or violence"
discover({ genres: ["Thriller"], withoutKeywordNames: ["gore", "graphic violence"] })
```

#### Implementation Tasks
- [x] Add exclusion fields to discover schema (`withoutCastNames`, `withoutCrewNames`, `withoutKeywordNames`)
- [x] Add AND/OR mode fields (`genreMode`, `castMode`, `keywordMode`)
- [x] Add certification fields (`certification`, `certificationLte`, `certificationCountry`)
- [x] Implement `searchKeywordByName` for exclusion keywords (already existed, now used for exclusions)
- [x] Handle comma vs pipe separator based on mode (via `formatFilterWithMode()`)
- [x] Add certification_country param for MPAA ratings
- [x] Update system prompt with exclusion examples
- [x] Fix `with_crew` filter handling (array vs string conversion)

---

### Phase 9: Mutation Tools (Pending)
Allow users to manage their library through conversation.

**Security:** All mutations require authenticated user. Validate ownership.

#### 9.1 Watchlist Mutations
```typescript
add_to_watchlist(id: number, mediaType: "movie" | "series")
remove_from_watchlist(id: number, mediaType: "movie" | "series")

// Returns:
{ success: true, message: "Added Fight Club to your watchlist" }
{ success: false, error: "Already in watchlist" }
```

#### 9.2 Rating Mutations
```typescript
rate_item(id: number, mediaType: "movie" | "series", rating: "like" | "dislike" | "clear")

// Returns:
{ success: true, message: "You liked Fight Club", previousRating: null }
{ success: true, message: "Rating cleared", previousRating: "like" }
```

#### 9.3 Watched Mutations
```typescript
mark_as_watched(id: number)  // movies only
unmark_as_watched(id: number)

// Returns:
{ success: true, message: "Marked Fight Club as watched" }
```

#### 9.4 System Prompt Guidance
```
## Library Management
You can help users manage their library:
- "Add this to my watchlist" → add_to_watchlist
- "Remove X from watchlist" → remove_from_watchlist  
- "I liked this" / "👍" → rate_item with "like"
- "I didn't like it" / "👎" → rate_item with "dislike"
- "I've seen this" → mark_as_watched

Always confirm the action and the item being modified.
```

#### Implementation Tasks
- [ ] Create `src/server/ai/tools/mutations.ts`
- [ ] Import existing server actions/API routes for mutations
- [ ] Add authentication check in all mutation tools
- [ ] Add confirmation messages with movie/series title
- [ ] Add tools to agent graph (authenticated users only)
- [ ] Update system prompt with mutation guidance
- [ ] Test mutation flows

---

### Phase 10: Enriched User Data (Pending)
User data tools currently return IDs only, making them useless for natural conversation.

#### 10.1 Enriched Watchlist
```typescript
get_user_watchlist()

// Current (bad):
{ movies: [{ id: 550 }, { id: 155 }] }

// Enriched (good):
{
  movies: [
    { id: 550, title: "Fight Club", year: "1999", genres: ["Drama"] },
    { id: 155, title: "The Dark Knight", year: "2008", genres: ["Action"] }
  ],
  series: [...],
  totalMovies: 12,
  totalSeries: 5,
  // Optional: recent additions for context
  recentlyAdded: "Fight Club (2 days ago)"
}
```

#### 10.2 Enriched Ratings
```typescript
get_user_ratings()

// Enriched:
{
  liked: [
    { id: 550, title: "Fight Club", type: "movie", genres: ["Drama", "Thriller"] },
    { id: 1396, name: "Breaking Bad", type: "series", genres: ["Drama", "Crime"] }
  ],
  disliked: [...],
  tasteProfile: {
    favoriteGenres: ["Drama", "Thriller", "Crime"],
    avoidGenres: ["Horror", "Musical"],
    preferredDecades: ["1990s", "2000s"]
  }
}
```

#### 10.3 Enriched Watched
```typescript
get_user_watched()

// Enriched:
{
  movies: [
    { id: 550, title: "Fight Club", year: "1999", watchedAt: "2024-01-15" }
  ],
  total: 45,
  recentlyWatched: [
    { id: 550, title: "Fight Club", daysAgo: 3 }
  ],
  stats: {
    totalRuntime: "89 hours",
    topGenres: ["Drama", "Thriller"]
  }
}
```

#### 10.4 Implementation Approach
Two options:
1. **Join at query time**: Fetch IDs, then batch-fetch titles from MongoDB/TMDB
2. **Store denormalized**: Save title/year alongside IDs in user library collections

Option 1 is cleaner but slower. Option 2 requires migration but is faster.

**Recommended:** Option 1 with caching. Create a `enrichUserItems(ids, mediaType)` helper.

#### 10.5 Continue Watching Tool
```typescript
get_continue_watching()

// Returns:
{
  items: [
    { 
      id: 1396, 
      name: "Breaking Bad", 
      type: "series",
      lastWatched: "2 days ago",
      progress: "Season 3, Episode 5"  // if available
    }
  ]
}
```

#### Implementation Tasks
- [ ] Create `enrichUserItems(ids[], mediaType)` helper
- [ ] Batch fetch from MongoDB movie/series collections
- [ ] Fall back to TMDB for missing items
- [ ] Update get_user_watchlist to return enriched data
- [ ] Update get_user_ratings to return enriched data + taste profile
- [ ] Update get_user_watched to return enriched data + stats
- [ ] Add get_continue_watching tool
- [ ] Keep responses lean (no poster URLs, just title/year/genres)

---

### Phase 11: Conversation Intelligence (Pending)
Improve multi-turn conversation quality.

#### 11.1 Session-Level Recommendation Tracking
Track recommended items within a session to avoid repetition.

```typescript
// In agent state:
recommendedInSession: Set<string>  // "movie:550", "series:1396"

// After each recommendation, add to set
// When discovering/suggesting, auto-exclude these
```

#### 11.2 Reference Resolution
Allow users to reference previous results by position.

```typescript
// User: "Tell me more about the second one"
// Agent should understand "second" refers to 2nd item in last response

// Track last results in state:
lastResults: Array<{ id: number, type: string, title: string }>

// System prompt guidance:
"If user refers to items by position ('the first one', 'number 3'), 
use lastResults to resolve which item they mean."
```

#### 11.3 Mood → Genre Mapping
Pre-built mappings in system prompt:

```
## Mood Interpretation
When users describe mood/feeling, map to genres:
- "happy", "feel-good", "uplifting" → Comedy, Animation, Family
- "sad", "cry", "emotional" → Drama, Romance
- "scared", "spooky" → Horror, Thriller
- "thrilling", "exciting" → Action, Adventure, Thriller
- "thoughtful", "deep" → Drama, Documentary
- "relaxing", "chill" → Comedy, Animation, Romance
- "date night" → Romance, Comedy (90-120 min)
- "family movie night" → Family, Animation, Adventure (certificationLte: PG-13)
```

#### 11.4 Time-Aware Defaults
```
## Time Context
Consider the time when making suggestions:
- Late night (after 10pm): Shorter films, comfort watches
- Weekend: Longer films, series binges
- Morning: Light content, documentaries
```

#### Implementation Tasks
- [ ] Add recommendedInSession to agent state
- [ ] Implement exclusion of session recommendations in discover
- [ ] Add lastResults tracking for position references
- [ ] Expand system prompt with mood mappings
- [ ] Add time-aware suggestion logic (optional)
- [ ] Test multi-turn conversations

---

### Phase 12: Production Readiness (Pending)
- [ ] Add rate limiting (per user, per IP)
- [ ] Implement conversation persistence (MongoDB)
- [ ] Add analytics/logging (tool usage, query patterns)
- [ ] Error handling improvements
- [ ] Mobile UI optimization
- [ ] Performance profiling
- [ ] Cost monitoring dashboard
- [ ] A/B testing framework for prompts

---

### Phase 13: Vector DB & Semantic Search (Future)
For truly natural queries like "movies that feel like a warm hug" or "something visually stunning but slow-paced".

#### Architecture
```
┌─────────────────────────────────────────────────────────┐
│ Vector Database (Pinecone / pgvector / Weaviate)       │
├─────────────────────────────────────────────────────────┤
│ Movie embeddings:                                       │
│   - Title + overview + genres + keywords               │
│   - Mood/tone descriptors                              │
│   - Visual style tags                                  │
├─────────────────────────────────────────────────────────┤
│ User preference embeddings:                            │
│   - Based on liked movies                              │
│   - Genre preferences                                  │
│   - Viewing patterns                                   │
└─────────────────────────────────────────────────────────┘
```

#### semantic_search Tool
```typescript
semantic_search(query: string, mediaType?: "movie" | "tv", limit?: number)

// Natural language query → vector search → ranked results
// "Visually stunning sci-fi with philosophical themes"
// "Cozy feel-good movies for a rainy day"
// "Dark psychological thrillers with unreliable narrators"
```

---

## Tool Response Guidelines

### Principles
1. **Lean responses**: Only data the agent needs for conversation
2. **No UI data**: No poster_path, backdrop_path, logo URLs
3. **Truncate text**: Overviews ≤300 chars, bios ≤300 chars
4. **Names over IDs**: Return "David Fincher" not crew ID 7467
5. **User context**: Include watchlist/watched/rating status when relevant
6. **Region-aware**: Streaming should reflect user's region

### What to Include
| Field | Include | Notes |
|-------|---------|-------|
| id | ✅ | Always needed for tags/navigation |
| title/name | ✅ | Display name |
| year | ✅ | Release year only, not full date |
| rating | ✅ | Formatted as "8.4" |
| runtime | ✅ | For "how long" questions |
| genres | ✅ | Array of names |
| overview | ✅ | Truncated to 300 chars |
| director | ✅ | Name(s) only |
| topCast | ✅ | Top 3-5 names |
| streaming | ✅ | Service names, not provider IDs |
| certification | ✅ | For family-friendly filtering |

### What to Exclude
| Field | Exclude | Reason |
|-------|---------|--------|
| poster_path | ❌ | UI renders from ID |
| backdrop_path | ❌ | UI renders from ID |
| logo_path | ❌ | UI renders from ID |
| production_companies | ❌ | Rarely useful |
| budget/revenue | ❌ | Rarely asked |
| homepage | ❌ | Not conversational |
| tagline | ❌ | Adds noise |
| full cast | ❌ | Top 5 is enough |
| full crew | ❌ | Director is enough |
| provider logos | ❌ | UI handles this |

### Response Size Targets
| Tool | Target Size | Max Items |
|------|-------------|-----------|
| discover | ~2KB | 8-10 results |
| get_movie_details | ~1KB | 1 result |
| get_person | ~1.5KB | 5 notable works |
| get_user_watchlist | ~2KB | 20 items |
| get_trending | ~2KB | 10 items |

---

## TMDB API Reference (for tool implementation)

### AND/OR Filter Logic
```
# AND (comma-separated) - must match ALL
with_genres=28,35         # Action AND Comedy

# OR (pipe-separated) - match ANY  
with_genres=28|35         # Action OR Comedy

# Works for: with_genres, with_keywords, with_cast, with_crew
```

### Exclusion Filters
```
without_genres=27,53      # Exclude Horror and Thriller
without_keywords=1234     # Exclude by keyword ID
without_companies=420     # Exclude by company ID
```

### Certification (Age Rating)
```
# Movies - use with certification_country
certification_country=US
certification=PG-13       # Exact match
certification.lte=PG-13   # PG-13 and below (G, PG, PG-13)

# TV - use with release dates endpoint or keywords
```

### Certification Values
| Movies (MPAA) | TV (US) |
|---------------|---------|
| G | TV-Y |
| PG | TV-Y7 |
| PG-13 | TV-G |
| R | TV-PG |
| NC-17 | TV-14 |
| | TV-MA |

---

## Notes

### Cost Considerations
- Amazon Nova Pro: Competitive pricing with strong performance
- Claude models available as alternatives
- Cross-region inference profiles optimize latency

### TMDB API Resilience
The TMDB service has built-in retry with exponential backoff:
- 3 retries (300ms, 600ms, 1200ms delays)
- 20s timeout with AbortController
- ECONNRESET error handling
- Connection: close header to prevent pooling issues
- In-memory caching via node-cache

### Latency Optimization
- Use streaming for immediate feedback
- Cache TMDB responses (already in place)
- Keep tool responses concise for faster LLM processing
- Consider response length limits

### Security
- Validate all user input
- Rate limit API endpoint
- Don't expose internal tool errors
- Sanitize navigation paths

