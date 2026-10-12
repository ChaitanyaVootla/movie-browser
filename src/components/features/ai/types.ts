import type { useChatStream } from "@/hooks/use-chat-stream";
import type { PageContext } from "@/hooks/use-chat-stream";

// =============================================================================
// Floaty State
// =============================================================================

export type FloatyState = "idle" | "active" | "expanded";

// =============================================================================
// Prompt Types
// =============================================================================

export interface PromptConfig {
  text: string;
  message: string;
}

// =============================================================================
// Extended Page Context
// =============================================================================

export interface ExtendedPageContext extends PageContext {
  aiQuestions?: string[];
}

// =============================================================================
// Component Props
// =============================================================================

export interface AssistantFloatyProps {
  className?: string;
  itemContext?: {
    mediaType: "movie" | "series" | "person";
    itemId: number;
    itemTitle?: string;
    aiQuestions?: string[];
  };
}

export interface PostWatchContext {
  title: string;
  tmdbId: number;
  mediaType: "movie" | "series";
  questions: string[];
  trivia: string[];
}

export interface IdleCircleProps {
  onExpand: (clickedPrompt?: PromptConfig) => void;
  showPrompt: boolean;
  prompt: PromptConfig | null;
  hasActiveConversation?: boolean;
  /** Post-watch mode: show movie-specific discussion prompts */
  postWatch?: PostWatchContext | null;
  /** Callback when a post-watch question is clicked */
  onPostWatchQuestion?: (message: string) => void;
  /** Callback to dismiss the post-watch bubble */
  onPostWatchDismiss?: () => void;
}

export interface MinimalViewProps {
  messages: ReturnType<typeof useChatStream>["messages"];
  isLoading: boolean;
  input: string;
  onInputChange: (value: string) => void;
  onSend: () => void;
  onExpand: () => void;
  /** Return to the idle bubble. Never clears the conversation. */
  onDismiss: () => void;
  prompts: PromptConfig[];
  featuredPrompt: PromptConfig | null;
  onPromptClick: (message: string) => void;
  pendingNavigation: ReturnType<typeof useChatStream>["pendingNavigation"];
  onNavigate: () => void;
}

export interface ExpandedChatProps {
  messages: ReturnType<typeof useChatStream>["messages"];
  isLoading: boolean;
  input: string;
  onInputChange: (value: string) => void;
  onSend: () => void;
  onCollapse: () => void;
  /** Return to the idle bubble. Never clears the conversation. */
  onDismiss: () => void;
  /** Start a new conversation — the only action that clears messages. */
  onReset: () => void;
  pendingNavigation: ReturnType<typeof useChatStream>["pendingNavigation"];
  onNavigate: () => void;
}

// =============================================================================
// Constants
// =============================================================================

export const CARD_WIDTH = 150;
export const CARD_HEIGHT = 225;
export const TRANSITION_EASE = [0.4, 0, 0.2, 1] as const;

// =============================================================================
// Window events (taste v2 spec 2026-10-12 §5.1–5.2)
// =============================================================================

/** Opens Cue with a message. Listened to by AssistantFloaty. */
export const AI_CHAT_TRIGGER_EVENT = "ai-chat-trigger";

export interface AiChatTriggerDetail {
  /** Sent as the user's message (or prefilled, see `prefill`). */
  message: string;
  /**
   * true → open the chat with `message` in the input and focus set, NOT sent
   * ("Steer with words"). Absent/false → send immediately (existing behaviour).
   * Honoured once workstream C wires it in assistant-floaty.
   */
  prefill?: boolean;
}

/** `[TUNE:…]` chat pill → For-you island (re-validates every token). */
export const RECS_TUNE_EVENT = "recs-tune";

export interface RecsTuneDetail {
  /** Raw tokens; the listener drops anything not in TUNE_TOKENS / its own g:/l:/m: sets. */
  tokens: string[];
}
