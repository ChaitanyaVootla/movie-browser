/**
 * Analytics Event Types
 *
 * Defines the schema for all analytics events tracked by the application.
 * These types are used both for TypeScript validation and ClickHouse ingestion.
 */

// =============================================================================
// Page Types
// =============================================================================

export type PageType =
  | "home"
  | "movie"
  | "series"
  | "person"
  | "browse"
  | "topics"
  | "topic_detail"
  | "watchlist"
  | "ratings"
  | "watched"
  | "search"
  | "admin"
  | "other";

// =============================================================================
// Action Types
// =============================================================================

export type ActionType =
  | "watchlist_add"
  | "watchlist_remove"
  | "rate_like"
  | "rate_dislike"
  | "rate_remove"
  | "mark_watched"
  | "unmark_watched"
  | "watch_click"
  | "trailer_play"
  | "search_submit"
  | "filter_apply"
  | "ai_chat_open"
  | "ai_chat_submit"
  | "share_click"
  | "external_link"
  | "search_result_click"
  | "topic_select"
  | "mood_select"
  | "carousel_nav"
  | "gallery_open"
  | "gallery_nav"
  | "settings_change"
  | "continue_watching_click";

// =============================================================================
// Query Types (AI)
// =============================================================================

export type QueryType =
  | "discover"
  | "streaming"
  | "ratings"
  | "recommendation"
  | "person"
  | "trending"
  | "detail"
  | "media"
  | "other"
  | "search_llm_parsing"
  | "embedding_query"
  | "embedding_document";

// =============================================================================
// Error Severity
// =============================================================================

export type ErrorSeverity = "low" | "medium" | "high" | "critical";

export type ErrorSource = "client" | "server" | "api" | "auth" | "render";

// =============================================================================
// Device Types
// =============================================================================

export type DeviceType = "mobile" | "tablet" | "desktop";

// =============================================================================
// Cache Hit Types
// =============================================================================

export type CacheHitType = "l1" | "l2" | "stale" | "miss";

// =============================================================================
// Base Event (Common Fields)
// =============================================================================

export interface BaseEvent {
  /** Unique event ID (UUID v4) */
  event_id?: string;
  /** Event timestamp (ISO 8601 with ms) */
  timestamp?: string;
  /** Session ID (SHA256 hash of fingerprint) */
  session_id: string;
  /** Hashed user ID (null if anonymous) */
  user_id: string | null;
  /** Whether user is authenticated */
  is_authenticated: boolean;
  /** Country code from GeoIP2 (e.g., "US", "IN") */
  country: string;
  /** City name from GeoIP2 */
  city: string | null;
  /** Full user agent string */
  user_agent: string;
  /** Device type classification */
  device_type: DeviceType;
  /** Browser name */
  browser: string;
  /** Operating system */
  os: string;
  /** Whether this is a bot request */
  is_bot: boolean;
  /** Bot type identifier if is_bot is true */
  bot_type: string | null;
  /** HTTP referer header */
  referer: string | null;
  /** Request ID for distributed tracing */
  request_id: string;
}

// =============================================================================
// Page View Event
// =============================================================================

export interface PageViewEvent extends BaseEvent {
  event_type: "page_view";
  /** URL path (e.g., /movie/550/fight-club) */
  path: string;
  /** Page type classification */
  page_type: PageType;
  /** TMDB ID if applicable */
  item_id: number | null;
  /** Item title for easier querying */
  item_title: string | null;
  /** Media type (movie, series, person) */
  item_media_type: "movie" | "series" | "person" | null;
  /** Previous page path */
  previous_path: string | null;
  /** Whether this is the first page of the session */
  entry_page: boolean;
  /** Time to first byte (ms) */
  ttfb: number | null;
  /** First contentful paint (ms) */
  fcp: number | null;
  /** Largest contentful paint (ms) */
  lcp: number | null;
  /** Cumulative layout shift */
  cls: number | null;
  /** First input delay (ms) */
  fid: number | null;
  /** Full page load time (ms) */
  load_time: number | null;
}

// =============================================================================
// Session Event
// =============================================================================

export interface SessionEvent extends BaseEvent {
  event_type: "session_start" | "session_end";
  /** Session duration in seconds (only on session_end) */
  duration_seconds: number | null;
  /** Number of pages viewed (only on session_end) */
  page_count: number | null;
  /** Number of actions taken (only on session_end) */
  actions_count: number | null;
  /** First page path */
  entry_path: string;
  /** First page type */
  entry_page_type: PageType;
  /** Last page path (only on session_end) */
  exit_path: string | null;
  /** Last page type (only on session_end) */
  exit_page_type: PageType | null;
  /** Array of page types visited in order */
  pages_visited: PageType[];
  /** Whether this was a single-page session */
  bounce: boolean;
}

// =============================================================================
// AI Usage Event
// =============================================================================

export interface AIUsageEvent {
  event_type: "ai_usage";
  /** Event timestamp */
  timestamp?: string;
  /** Session ID */
  session_id: string;
  /** User ID (hashed) */
  user_id: string | null;
  /** User display name for easier identification in dashboards */
  user_name: string;
  /** Whether authenticated */
  is_authenticated: boolean;
  /** Country code */
  country: string;
  /** User query (truncated to 500 chars) */
  query: string;
  /** Query type classification */
  query_type: QueryType;
  /** Whether query had page context */
  has_page_context: boolean;
  /** Page context type if present */
  page_context_type: PageType | null;
  /** Page context item ID if present */
  page_context_id: number | null;
  /** Bedrock model ID */
  model_id: string;
  /** Human-readable model name */
  model_name: string;
  /** Input tokens consumed */
  input_tokens: number;
  /** Output tokens generated */
  output_tokens: number;
  /** Total tokens */
  total_tokens: number;
  /** Input cost in USD */
  input_cost: number;
  /** Output cost in USD */
  output_cost: number;
  /** Total cost in USD */
  total_cost: number;
  /** Number of agent turns */
  turns: number;
  /** Tool names called */
  tool_calls: string[];
  /** Total execution time (ms) */
  duration_ms: number;
  /** Whether tool calls were recovered from text */
  had_tool_recovery: boolean;
  /** Response length in chars */
  response_length: number;
}

// =============================================================================
// User Action Event
// =============================================================================

export interface UserActionEvent extends Partial<BaseEvent> {
  event_type: "user_action";
  /** Session ID */
  session_id: string;
  /** User ID */
  user_id: string | null;
  /** Whether authenticated */
  is_authenticated: boolean;
  /** Country code */
  country: string;
  /** Whether bot */
  is_bot: boolean;
  /** Action type */
  action: ActionType;
  /** Media type */
  media_type: "movie" | "series" | null;
  /** Item ID */
  item_id: number | null;
  /** Item title */
  item_title: string | null;
  /** Additional metadata */
  metadata: Record<string, unknown>;
}

// =============================================================================
// API Call Event
// =============================================================================

export interface APICallEvent {
  event_type: "api_call";
  /** Timestamp */
  timestamp?: string;
  /** Session ID */
  session_id: string;
  /** Request ID */
  request_id: string;
  /** Service name (tmdb, youtube, mongodb, lambda, embedding) */
  service: "tmdb" | "youtube" | "mongodb" | "lambda" | "embedding";
  /** API endpoint */
  endpoint: string;
  /** HTTP method */
  method: string;
  /** HTTP status code */
  status_code: number;
  /** Duration in ms */
  duration_ms: number;
  /** Response size in bytes */
  response_size: number;
  /** Whether response was cached */
  cached: boolean;
  /** Cache hit type */
  cache_hit: CacheHitType | null;
  /** Quota cost (YouTube) */
  quota_cost: number | null;
  /** Error type if failed */
  error_type: string | null;
  /** Error message if failed */
  error_message: string | null;
}

// =============================================================================
// Error Event
// =============================================================================

export interface ErrorEvent {
  event_type: "error";
  /** Timestamp */
  timestamp?: string;
  /** Session ID */
  session_id: string;
  /** User ID */
  user_id: string | null;
  /** Country */
  country: string;
  /** User agent */
  user_agent: string;
  /** Error source */
  error_source: ErrorSource;
  /** Error type (TypeError, NetworkError, etc.) */
  error_type: string;
  /** Error message */
  error_message: string;
  /** Stack trace (truncated to 2000 chars) */
  error_stack: string | null;
  /** Route where error occurred */
  route: string | null;
  /** React component name */
  component: string | null;
  /** Additional context */
  context: Record<string, unknown>;
  /** Severity level */
  severity: ErrorSeverity;
}

// =============================================================================
// Cache Metrics Event
// =============================================================================

export interface CacheMetricsEvent {
  event_type: "cache_metrics";
  /** Timestamp */
  timestamp?: string;
  /** L1 hit rate (0-1) */
  l1_hit_rate: number;
  /** L2 hit rate (0-1) */
  l2_hit_rate: number;
  /** L1 hits since last report */
  l1_hits: number;
  /** L1 misses since last report */
  l1_misses: number;
  /** L2 hits since last report */
  l2_hits: number;
  /** L2 misses since last report */
  l2_misses: number;
  /** Stale-while-revalidate hits */
  stale_hits: number;
  /** Background refresh count */
  background_refreshes: number;
  /** Bytes saved by compression */
  compression_savings_bytes: number;
  /** Number of compressed writes */
  compressed_writes: number;
  /** Number of keys in memory */
  memory_keys: number;
  /** Fetch errors */
  fetch_errors: number;
  /** Namespace sizes */
  namespace_sizes: {
    youtube: { files: number; bytes: number };
    youtube_channels: { files: number; bytes: number };
    movie: { files: number; bytes: number };
    series: { files: number; bytes: number };
    person: { files: number; bytes: number };
    discover: { files: number; bytes: number };
    search: { files: number; bytes: number };
  };
}

// =============================================================================
// Performance Event
// =============================================================================

export interface PerformanceEvent {
  event_type: "performance";
  /** Timestamp */
  timestamp?: string;
  /** Session ID */
  session_id: string;
  /** Country */
  country: string;
  /** Device type */
  device_type: DeviceType;
  /** Connection type (4g, 3g, wifi, etc.) */
  connection_type: string | null;
  /** Page path */
  path: string;
  /** Page type */
  page_type: PageType;
  /** Time to first byte (ms) */
  ttfb: number;
  /** First contentful paint (ms) */
  fcp: number;
  /** Largest contentful paint (ms) */
  lcp: number;
  /** Cumulative layout shift */
  cls: number;
  /** Interaction to Next Paint (ms) - replaced FID in web-vitals v4+ */
  inp: number | null;
  /** Number of resources loaded */
  resource_count: number;
  /** Total bytes transferred */
  total_transfer_size: number;
}

// =============================================================================
// Union Type for All Events
// =============================================================================

export type AnalyticsEvent =
  | PageViewEvent
  | SessionEvent
  | AIUsageEvent
  | UserActionEvent
  | APICallEvent
  | ErrorEvent
  | CacheMetricsEvent
  | PerformanceEvent;

// =============================================================================
// Tracking Context (Extracted from Request)
// =============================================================================

export interface TrackingContext {
  /** Request ID */
  request_id: string;
  /** Event timestamp */
  timestamp: string;
  /** Session ID (hashed fingerprint) */
  session_id: string;
  /** User ID (hashed, null if anonymous) */
  user_id: string | null;
  /** Whether authenticated */
  is_authenticated: boolean;
  /** Whether user is admin (exclude from analytics) */
  is_admin: boolean;
  /** Country code */
  country: string;
  /** City name */
  city: string | null;
  /** User agent string */
  user_agent: string;
  /** Device type */
  device_type: DeviceType;
  /** Browser name */
  browser: string;
  /** OS name */
  os: string;
  /** Whether bot */
  is_bot: boolean;
  /** Bot type */
  bot_type: string | null;
  /** Referer */
  referer: string | null;
}

// =============================================================================
// Batch Ingest Request
// =============================================================================

export interface BatchIngestRequest {
  events: AnalyticsEvent[];
}

export interface IngestResponse {
  success: boolean;
  processed: number;
  errors?: string[];
}
