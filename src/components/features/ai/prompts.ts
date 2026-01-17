import type { PromptConfig, ExtendedPageContext } from "./types";

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Shuffle array and return first n items
 */
function pickRandom<T>(arr: T[], count: number): T[] {
  const shuffled = [...arr].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}

/**
 * Truncate text for button labels
 */
function truncateForButton(text: string, maxLength: number = 25): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 1).trim() + "...";
}

// =============================================================================
// Prompt Generation Functions
// =============================================================================

/**
 * Movie-specific prompts when on a movie detail page
 * If aiQuestions are available, blend them with hardcoded prompts
 */
export function getMovieDetailPrompts(title?: string, aiQuestions?: string[]): PromptConfig[] {
  const itemRef = title || "this movie";

  // Convert AI questions to prompt configs
  const aiPrompts: PromptConfig[] = (aiQuestions || []).slice(0, 3).map((q) => ({
    text: truncateForButton(q),
    message: q,
  }));

  // Hardcoded fallback prompts
  const fallbackPrompts: PromptConfig[] = [
    { text: "Talk smack about it", message: `Talk smack about ${itemRef}` },
    { text: "Hype this up", message: `Hype up ${itemRef} - convince me to watch` },
    { text: "Hot take?", message: `What's your hot take on ${itemRef}?` },
    { text: "Is it overrated?", message: `Is ${itemRef} overrated?` },
    { text: "Be brutally honest", message: `Be brutally honest about ${itemRef}` },
    { text: "Sell me on it", message: `Sell me on ${itemRef}` },
    { text: "What's the vibe?", message: `What's the vibe of ${itemRef}?` },
    { text: "Roast it", message: `Roast ${itemRef}` },
    { text: "Worth my time?", message: `Is ${itemRef} worth watching?` },
    { text: "Similar movies", message: `Find movies similar to ${itemRef}` },
  ];

  // If we have AI questions, prioritize them and fill remaining slots with fallbacks
  if (aiPrompts.length > 0) {
    const remaining = 4 - aiPrompts.length;
    const fillers = pickRandom(fallbackPrompts, remaining);
    return [...aiPrompts, ...fillers];
  }

  return pickRandom(fallbackPrompts, 3);
}

/**
 * Series-specific prompts when on a series detail page
 * If aiQuestions are available, blend them with hardcoded prompts
 */
export function getSeriesDetailPrompts(title?: string, aiQuestions?: string[]): PromptConfig[] {
  const itemRef = title || "this series";

  // Convert AI questions to prompt configs
  const aiPrompts: PromptConfig[] = (aiQuestions || []).slice(0, 3).map((q) => ({
    text: truncateForButton(q),
    message: q,
  }));

  const fallbackPrompts: PromptConfig[] = [
    { text: "Talk smack about it", message: `Talk smack about ${itemRef}` },
    { text: "Hype this up", message: `Hype up ${itemRef}` },
    { text: "Hot take?", message: `What's your hot take on ${itemRef}?` },
    { text: "Is it bingeworthy?", message: `Is ${itemRef} bingeworthy?` },
    { text: "Be brutally honest", message: `Be brutally honest about ${itemRef}` },
    { text: "Worth the commitment?", message: `Is ${itemRef} worth the time investment?` },
    { text: "Peak or overrated?", message: `Is ${itemRef} peak TV or overrated?` },
    { text: "Similar shows", message: `Find series similar to ${itemRef}` },
    { text: "What's the vibe?", message: `What's the vibe of ${itemRef}?` },
    { text: "Convince me", message: `Convince me to start ${itemRef}` },
  ];

  // If we have AI questions, prioritize them and fill remaining slots with fallbacks
  if (aiPrompts.length > 0) {
    const remaining = 4 - aiPrompts.length;
    const fillers = pickRandom(fallbackPrompts, remaining);
    return [...aiPrompts, ...fillers];
  }

  return pickRandom(fallbackPrompts, 3);
}

/**
 * Person-specific prompts when on a person detail page
 */
export function getPersonDetailPrompts(name?: string): PromptConfig[] {
  const personRef = name || "them";
  const allPrompts: PromptConfig[] = [
    { text: "What're they cooking?", message: `What is ${personRef} working on these days?` },
    { text: "Their best work", message: `What's ${personRef}'s best work?` },
    { text: "Underrated picks", message: `What's an underrated ${personRef} movie?` },
    { text: "Hot take", message: `What's your hot take on ${personRef}?` },
    { text: "Career peak?", message: `What was ${personRef}'s career peak?` },
    { text: "Must-watch", message: `Give me a must-watch ${personRef} movie` },
  ];
  return pickRandom(allPrompts, 3);
}

/**
 * Landing page / browse prompts
 */
export function getHomepagePrompts(): PromptConfig[] {
  const allPrompts: PromptConfig[] = [
    { text: "Surprise me", message: "Surprise me with something good" },
    { text: "What should I binge?", message: "What should I binge this weekend?" },
    { text: "Peak cinema", message: "Show me some peak cinema" },
    { text: "Underrated gems", message: "Show me some underrated gems" },
    { text: "Chaotic picks", message: "Give me something chaotic to watch" },
    { text: "Comfort watch", message: "I need a comfort watch" },
    { text: "Make me cry", message: "Recommend something that'll make me cry" },
    { text: "Mind-benders", message: "Show me some mind-bending movies" },
    { text: "90s nostalgia", message: "Give me some 90s nostalgia" },
    { text: "Foreign films", message: "Recommend some great foreign films" },
  ];
  // Always include "What's trending?" as the first one
  const trending: PromptConfig = {
    text: "What's trending?",
    message: "What's trending right now?",
  };
  const randomPicks = pickRandom(allPrompts, 3);
  return [trending, ...randomPicks];
}

/**
 * Alias for getHomepagePrompts - used for browse pages
 */
export function getBrowsePrompts(): PromptConfig[] {
  return getHomepagePrompts();
}

/**
 * Get contextual prompts based on current page context
 */
export function getContextualPrompts(pageContext: ExtendedPageContext | null): PromptConfig[] {
  if (!pageContext) return getHomepagePrompts();

  if (pageContext.mediaType === "movie" && pageContext.itemId) {
    return getMovieDetailPrompts(pageContext.itemTitle, pageContext.aiQuestions);
  }

  if (pageContext.mediaType === "series" && pageContext.itemId) {
    return getSeriesDetailPrompts(pageContext.itemTitle, pageContext.aiQuestions);
  }

  if (pageContext.mediaType === "person" && pageContext.itemId) {
    return getPersonDetailPrompts(pageContext.itemTitle);
  }

  if (pageContext.path?.includes("/browse") || pageContext.path?.includes("/topics")) {
    return getBrowsePrompts();
  }

  return getHomepagePrompts();
}

// =============================================================================
// Idle Prompts (shown in the floating bubble)
// =============================================================================

export const IDLE_PROMPTS: PromptConfig[] = [
  { text: "What's trending?", message: "What's trending right now?" },
  { text: "Surprise me", message: "Surprise me with something good" },
  { text: "Got recommendations?", message: "Got any recommendations?" },
  { text: "What should I watch?", message: "What should I watch tonight?" },
];
