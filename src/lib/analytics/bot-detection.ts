/**
 * Bot Detection
 *
 * Identifies bots, crawlers, and automated traffic from user agent strings.
 * Used to filter analytics data for accurate human traffic metrics.
 */

// =============================================================================
// Types
// =============================================================================

interface BotPattern {
  /** Regex pattern to match */
  pattern: RegExp;
  /** Bot type identifier */
  type: string;
  /** Bot category */
  category: BotCategory;
}

export type BotCategory = "search_engine" | "social" | "tool" | "monitoring" | "scraper" | "ai";

export interface BotDetectionResult {
  isBot: boolean;
  botType: string | null;
  botCategory: BotCategory | null;
}

// =============================================================================
// Bot Patterns
// =============================================================================

const BOT_PATTERNS: BotPattern[] = [
  // Search Engines
  { pattern: /googlebot/i, type: "googlebot", category: "search_engine" },
  { pattern: /bingbot/i, type: "bingbot", category: "search_engine" },
  { pattern: /yandexbot/i, type: "yandex", category: "search_engine" },
  { pattern: /baiduspider/i, type: "baidu", category: "search_engine" },
  { pattern: /duckduckbot/i, type: "duckduckgo", category: "search_engine" },
  { pattern: /slurp/i, type: "yahoo", category: "search_engine" },
  { pattern: /applebot/i, type: "apple", category: "search_engine" },
  { pattern: /msnbot/i, type: "msn", category: "search_engine" },
  { pattern: /googleother/i, type: "googleother", category: "search_engine" },
  { pattern: /google-inspectiontool/i, type: "google_inspection", category: "search_engine" },

  // Social Media
  { pattern: /facebookexternalhit/i, type: "facebook", category: "social" },
  { pattern: /twitterbot/i, type: "twitter", category: "social" },
  { pattern: /linkedinbot/i, type: "linkedin", category: "social" },
  { pattern: /pinterestbot/i, type: "pinterest", category: "social" },
  { pattern: /telegrambot/i, type: "telegram", category: "social" },
  { pattern: /whatsapp/i, type: "whatsapp", category: "social" },
  { pattern: /discordbot/i, type: "discord", category: "social" },
  { pattern: /slackbot/i, type: "slack", category: "social" },
  { pattern: /redditbot/i, type: "reddit", category: "social" },
  { pattern: /vkshare/i, type: "vk", category: "social" },
  { pattern: /embedly/i, type: "embedly", category: "social" },
  { pattern: /flipboard/i, type: "flipboard", category: "social" },

  // Performance/SEO Tools
  { pattern: /lighthouse/i, type: "lighthouse", category: "tool" },
  { pattern: /pagespeed/i, type: "pagespeed", category: "tool" },
  { pattern: /gtmetrix/i, type: "gtmetrix", category: "tool" },
  { pattern: /pingdom/i, type: "pingdom", category: "tool" },
  { pattern: /ahrefsbot/i, type: "ahrefs", category: "tool" },
  { pattern: /semrushbot/i, type: "semrush", category: "tool" },
  { pattern: /mj12bot/i, type: "majestic", category: "tool" },
  { pattern: /screaming frog/i, type: "screaming_frog", category: "tool" },
  { pattern: /dotbot/i, type: "dotbot", category: "tool" },
  { pattern: /rogerbot/i, type: "moz", category: "tool" },
  { pattern: /seznambot/i, type: "seznam", category: "tool" },

  // Monitoring
  { pattern: /uptimerobot/i, type: "uptimerobot", category: "monitoring" },
  { pattern: /statuscake/i, type: "statuscake", category: "monitoring" },
  { pattern: /site24x7/i, type: "site24x7", category: "monitoring" },
  { pattern: /newrelicpinger/i, type: "newrelic", category: "monitoring" },
  { pattern: /datadog/i, type: "datadog", category: "monitoring" },
  { pattern: /prtg/i, type: "prtg", category: "monitoring" },

  // AI/LLM Crawlers
  { pattern: /gptbot/i, type: "openai", category: "ai" },
  { pattern: /chatgpt-user/i, type: "chatgpt", category: "ai" },
  { pattern: /claudebot/i, type: "anthropic", category: "ai" },
  { pattern: /claude-web/i, type: "anthropic", category: "ai" },
  { pattern: /ccbot/i, type: "common_crawl", category: "ai" },
  { pattern: /bytespider/i, type: "bytedance", category: "ai" },
  { pattern: /petalbot/i, type: "huggingface", category: "ai" },
  { pattern: /meta-externalagent/i, type: "meta", category: "ai" },
  { pattern: /cohere-ai/i, type: "cohere", category: "ai" },
  { pattern: /amazonbot/i, type: "amazon", category: "ai" },
  { pattern: /anthropic-ai/i, type: "anthropic", category: "ai" },

  // Generic Bot/Script Patterns (check last - less specific)
  { pattern: /bot[^a-z]/i, type: "generic_bot", category: "scraper" },
  { pattern: /crawler/i, type: "crawler", category: "scraper" },
  { pattern: /spider/i, type: "spider", category: "scraper" },
  { pattern: /scraper/i, type: "scraper", category: "scraper" },
  { pattern: /^curl\//i, type: "curl", category: "scraper" },
  { pattern: /^wget\//i, type: "wget", category: "scraper" },
  { pattern: /python-requests/i, type: "python_requests", category: "scraper" },
  { pattern: /python-urllib/i, type: "python_urllib", category: "scraper" },
  { pattern: /go-http-client/i, type: "go_http", category: "scraper" },
  { pattern: /java\//i, type: "java", category: "scraper" },
  { pattern: /^php\//i, type: "php", category: "scraper" },
  { pattern: /headless/i, type: "headless", category: "scraper" },
  { pattern: /phantomjs/i, type: "phantomjs", category: "scraper" },
  { pattern: /selenium/i, type: "selenium", category: "scraper" },
  { pattern: /puppeteer/i, type: "puppeteer", category: "scraper" },
  { pattern: /playwright/i, type: "playwright", category: "scraper" },
  { pattern: /axios/i, type: "axios", category: "scraper" },
  { pattern: /node-fetch/i, type: "node_fetch", category: "scraper" },
  { pattern: /undici/i, type: "undici", category: "scraper" },
  { pattern: /^okhttp/i, type: "okhttp", category: "scraper" },
  { pattern: /libwww-perl/i, type: "perl", category: "scraper" },

  // Headless-automation fingerprints behind otherwise-clean browser UAs.
  // June 2026 (post-GA): a stealth scraper fleet appeared as ~3.4k "human"
  // sessions/12h — 98% single-pageview, exactly 1.0 views/session. Their UAs
  // were Puppeteer/Playwright DEVICE-EMULATION PRESETS (ancient strings
  // shipped with the libraries) and years-stale Chrome versions.
  { pattern: /SM-G900P Build\/LRX21T/i, type: "headless_preset", category: "scraper" },
  { pattern: /Pixel 2 Build\/OPD3\.170816\.012/i, type: "headless_preset", category: "scraper" },
  { pattern: /iPhone OS 13_2_3/i, type: "headless_preset", category: "scraper" },
  // Chrome major <= 109 in 2026: auto-update makes real usage ~zero; these
  // are stale UA strings baked into scraper configs. Matches "Chrome/NN.d"
  // for majors 10-109 only (110+ never matches: "11x." fails both branches).
  { pattern: /chrome\/(?:[1-9]\d|10[0-9])\.\d/i, type: "stale_chrome", category: "scraper" },
];

// =============================================================================
// Detection Functions
// =============================================================================

/**
 * Detect if a user agent belongs to a bot
 */
export function detectBot(userAgent: string): BotDetectionResult {
  // Empty or missing user agent is suspicious
  if (!userAgent || userAgent.trim() === "") {
    return {
      isBot: true,
      botType: "empty_ua",
      botCategory: "scraper",
    };
  }

  // Check against known patterns
  for (const { pattern, type, category } of BOT_PATTERNS) {
    if (pattern.test(userAgent)) {
      return {
        isBot: true,
        botType: type,
        botCategory: category,
      };
    }
  }

  return {
    isBot: false,
    botType: null,
    botCategory: null,
  };
}

/**
 * Request-level bot detection: combines the UA patterns with signals a spoofed
 * user agent cannot hide as easily —
 * - `sec-ch-ua` client hints: headless Chrome ≥110 reports "HeadlessChrome"
 *   as its brand even when the UA string is overridden.
 * - `navigator.webdriver`: true under Puppeteer/Playwright/Selenium unless
 *   deliberately evaded; the client sends it as the `x-analytics-wd` header.
 */
export function detectBotFromRequest(
  userAgent: string,
  secChUa: string | null,
  webdriverHeader: string | null
): BotDetectionResult {
  if (webdriverHeader === "1") {
    return { isBot: true, botType: "webdriver", botCategory: "scraper" };
  }
  if (secChUa && /headless/i.test(secChUa)) {
    return { isBot: true, botType: "headless_hint", botCategory: "scraper" };
  }
  return detectBot(userAgent);
}

// =============================================================================
// Suspicious Traffic Detection
// =============================================================================

export interface SuspiciousTrafficResult {
  suspicious: boolean;
  reason: string | null;
  confidence: "low" | "medium" | "high";
}

interface SuspiciousTrafficInput {
  userAgent: string;
  acceptLanguage: string | null;
  acceptEncoding: string | null;
  referer: string | null;
  requestsPerMinute?: number;
}

/**
 * Detect suspicious (likely automated) traffic patterns
 * beyond simple bot detection
 */
export function detectSuspiciousTraffic(request: SuspiciousTrafficInput): SuspiciousTrafficResult {
  // Missing standard headers that browsers always send
  if (!request.acceptLanguage && !request.acceptEncoding) {
    return {
      suspicious: true,
      reason: "missing_browser_headers",
      confidence: "high",
    };
  }

  // Missing accept-language specifically (most bots miss this)
  if (!request.acceptLanguage) {
    return {
      suspicious: true,
      reason: "missing_accept_language",
      confidence: "medium",
    };
  }

  // Suspiciously high request rate (>60 req/min from single session)
  if (request.requestsPerMinute && request.requestsPerMinute > 60) {
    return {
      suspicious: true,
      reason: "high_request_rate",
      confidence: "high",
    };
  }

  // Very short user agent (suspicious)
  if (request.userAgent.length < 20) {
    return {
      suspicious: true,
      reason: "short_user_agent",
      confidence: "low",
    };
  }

  return {
    suspicious: false,
    reason: null,
    confidence: "low",
  };
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Check if a bot should be tracked (some bots like search engines are useful to track)
 */
export function shouldTrackBot(botCategory: BotCategory | null): boolean {
  // Track search engines and social bots (useful for SEO analysis)
  if (botCategory === "search_engine" || botCategory === "social") {
    return true;
  }
  // Track AI crawlers (useful for monitoring AI training data access)
  if (botCategory === "ai") {
    return true;
  }
  // Skip monitoring tools, scrapers, and generic tools
  return false;
}

/**
 * Get a human-readable description of a bot type
 */
export function getBotDescription(botType: string): string {
  const descriptions: Record<string, string> = {
    googlebot: "Google Search Crawler",
    bingbot: "Bing Search Crawler",
    facebook: "Facebook Link Preview",
    twitter: "Twitter/X Card Fetcher",
    lighthouse: "Google Lighthouse Audit",
    openai: "OpenAI GPTBot",
    anthropic: "Anthropic Claude Bot",
    generic_bot: "Generic Bot",
    empty_ua: "Empty User Agent",
  };

  return descriptions[botType] || `Bot: ${botType}`;
}
