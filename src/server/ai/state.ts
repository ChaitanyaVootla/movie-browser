/**
 * AI Agent State Definition
 *
 * Defines the state structure for the LangGraph movie recommendation agent.
 */

import { Annotation, messagesStateReducer } from "@langchain/langgraph";
import type { BaseMessage } from "@langchain/core/messages";

// =============================================================================
// Types
// =============================================================================

/**
 * Media item returned in recommendations
 */
export interface AgentMediaItem {
  id: number;
  title: string; // movie.title or series.name
  mediaType: "movie" | "tv";
  posterPath: string | null;
  backdropPath: string | null;
  overview: string;
  voteAverage: number;
  releaseDate: string; // release_date or first_air_date
  genres: { id: number; name: string }[];
}

/**
 * Navigation action to be handled by the client
 */
export interface NavigationAction {
  type: "navigate";
  path: string;
  itemId?: number;
  itemType?: "movie" | "series" | "person";
}

/**
 * Page context for contextual recommendations
 */
export interface PageContext {
  path: string;
  mediaType?: "movie" | "series" | "person";
  itemId?: number;
  itemTitle?: string;
}

/**
 * User context for personalization
 */
export interface UserContext {
  name?: string;
  region?: string;
  currentTime: string;
}

// =============================================================================
// Agent State Annotation
// =============================================================================

/**
 * LangGraph state annotation for the movie agent
 *
 * - messages: Conversation history
 * - userId: Authenticated user ID (null if guest)
 * - pageContext: Current page context for contextual recommendations
 * - recommendations: Media items to display as cards
 * - navigation: Navigation action for client to handle
 * - isComplete: Whether the agent has finished processing
 */
export const AgentState = Annotation.Root({
  // Conversation messages (with built-in reducer for message history)
  messages: Annotation<BaseMessage[]>({
    reducer: messagesStateReducer,
  }),

  // User ID for database operations (null for guest users)
  userId: Annotation<string | null>({
    reducer: (_, newVal) => newVal,
    default: () => null,
  }),

  // User context for personalization (name, region, time)
  userContext: Annotation<UserContext | null>({
    reducer: (_, newVal) => newVal,
    default: () => null,
  }),

  // Current page context (for contextual recommendations)
  pageContext: Annotation<PageContext | null>({
    reducer: (_, newVal) => newVal,
    default: () => null,
  }),

  // Recommendations to display as cards in the UI
  recommendations: Annotation<AgentMediaItem[]>({
    reducer: (_, newVal) => newVal,
    default: () => [],
  }),

  // Navigation action for client to execute
  navigation: Annotation<NavigationAction | null>({
    reducer: (_, newVal) => newVal,
    default: () => null,
  }),

  // Processing complete flag
  isComplete: Annotation<boolean>({
    reducer: (_, newVal) => newVal,
    default: () => false,
  }),
});

export type AgentStateType = typeof AgentState.State;
