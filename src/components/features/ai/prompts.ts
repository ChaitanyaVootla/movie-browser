import type { PromptConfig } from "./types";
import type { MediaContextState } from "@/stores/media-context";

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
// Dynamic Sassy Prompt Generators (using media context)
// =============================================================================

/**
 * Generate contextual sassy prompts based on actual movie/series data
 */
function generateDynamicPrompts(ctx: MediaContextState): PromptConfig[] {
  const prompts: PromptConfig[] = [];
  const title = ctx.title || "this";

  // Rating-based sass
  if (ctx.rating !== null) {
    const ratingDisplay = ctx.rating.toFixed(1);
    if (ctx.rating >= 8.5) {
      prompts.push({
        text: `${ratingDisplay}? Really?`,
        message: `${title} has a ${ratingDisplay}/10 - is it actually that good or are people bandwagoning?`,
      });
    } else if (ctx.rating >= 7.5) {
      prompts.push({
        text: "Lives up to hype?",
        message: `Does ${title} actually live up to its ${ratingDisplay} rating?`,
      });
    } else if (ctx.rating >= 6 && ctx.rating < 7) {
      prompts.push({
        text: "Mid or misunderstood?",
        message: `${title} has a ${ratingDisplay} rating - is it actually mid or just misunderstood?`,
      });
    } else if (ctx.rating < 6 && ctx.rating > 0) {
      prompts.push({
        text: "Why so hated?",
        message: `${title} only has a ${ratingDisplay}/10 - what went wrong?`,
      });
    }
  }

  // Runtime-based sass (movies only)
  if (ctx.mediaType === "movie" && ctx.runtime !== null) {
    if (ctx.runtime > 170) {
      const hours = Math.floor(ctx.runtime / 60);
      const mins = ctx.runtime % 60;
      prompts.push({
        text: `${hours}h ${mins}m?!`,
        message: `${title} is ${hours} hours ${mins} minutes long - is every minute worth it or could they have trimmed it?`,
      });
    } else if (ctx.runtime > 150) {
      prompts.push({
        text: "Worth the runtime?",
        message: `At ${ctx.runtime} minutes, is ${title} worth the time commitment?`,
      });
    } else if (ctx.runtime < 90) {
      prompts.push({
        text: "Too short?",
        message: `${title} is only ${ctx.runtime} minutes - does it feel rushed or perfectly paced?`,
      });
    }
  }

  // Season count sass (series only)
  if (ctx.mediaType === "series" && ctx.seasonCount !== null) {
    if (ctx.seasonCount >= 8) {
      prompts.push({
        text: `${ctx.seasonCount} seasons?!`,
        message: `${title} has ${ctx.seasonCount} seasons - does it stay good or should I bail early?`,
      });
    } else if (ctx.seasonCount === 1) {
      prompts.push({
        text: "One and done?",
        message: `${title} only has 1 season - is it a perfect limited series or did it get cancelled too soon?`,
      });
    }
  }

  // Series status sass
  if (ctx.mediaType === "series" && ctx.status) {
    if (ctx.status === "Canceled" || ctx.status === "Cancelled") {
      prompts.push({
        text: "Why cancelled?",
        message: `${title} got cancelled - was it deserved or a tragedy?`,
      });
    } else if (ctx.status === "Ended") {
      prompts.push({
        text: "Stuck the landing?",
        message: `Did ${title} have a satisfying ending or did they botch it?`,
      });
    }
  }

  // Vote count sass
  if (ctx.voteCount !== null && ctx.voteCount > 50000) {
    const voteDisplay =
      ctx.voteCount > 1000000
        ? `${(ctx.voteCount / 1000000).toFixed(1)}M`
        : ctx.voteCount > 1000
          ? `${Math.round(ctx.voteCount / 1000)}k`
          : ctx.voteCount.toString();
    prompts.push({
      text: "Why the hype?",
      message: `${voteDisplay} people rated ${title} - why does everyone have opinions on this?`,
    });
  }

  // Year-based sass
  if (ctx.year) {
    const yearNum = parseInt(ctx.year);
    const currentYear = new Date().getFullYear();
    if (yearNum < 1980) {
      prompts.push({
        text: "Still holds up?",
        message: `${title} is from ${ctx.year} - does it still hold up or is it just nostalgia?`,
      });
    } else if (yearNum < 2000) {
      prompts.push({
        text: "90s nostalgia?",
        message: `Is ${title} genuinely good or am I just nostalgic for the ${ctx.year.slice(0, 3)}0s?`,
      });
    } else if (yearNum >= currentYear - 1) {
      prompts.push({
        text: "Worth the buzz?",
        message: `${title} just came out - is it actually good or just marketing hype?`,
      });
    }
  }

  // Genre-specific sass
  if (ctx.genres && ctx.genres.length > 0) {
    const genreSet = new Set(ctx.genres.map((g) => g.toLowerCase()));

    if (genreSet.has("horror")) {
      prompts.push({
        text: "Actually scary?",
        message: `Is ${title} genuinely terrifying or just cheap jumpscares?`,
      });
    }
    if (genreSet.has("comedy")) {
      prompts.push({
        text: "Actually funny?",
        message: `Is ${title} genuinely hilarious or does it just think it is?`,
      });
    }
    if (genreSet.has("romance")) {
      prompts.push({
        text: "Cringe or cute?",
        message: `Is ${title} actually romantic or just cringe?`,
      });
    }
    if (genreSet.has("thriller") || genreSet.has("mystery")) {
      prompts.push({
        text: "Predictable?",
        message: `Is ${title}'s twist predictable or did it actually get you?`,
      });
    }
    if (genreSet.has("action")) {
      prompts.push({
        text: "All style no substance?",
        message: `Is ${title} just explosions or is there actually a good story?`,
      });
    }
    if (genreSet.has("drama")) {
      prompts.push({
        text: "Oscar bait?",
        message: `Is ${title} genuinely moving or just Oscar bait?`,
      });
    }
    if (genreSet.has("animation")) {
      prompts.push({
        text: "Just for kids?",
        message: `Is ${title} just for kids or does it hit different as an adult?`,
      });
    }
    if (genreSet.has("documentary")) {
      prompts.push({
        text: "Biased?",
        message: `Is ${title} objective or pushing an agenda?`,
      });
    }
    if (genreSet.has("science fiction") || genreSet.has("sci-fi")) {
      prompts.push({
        text: "Smart or dumb sci-fi?",
        message: `Is ${title} thoughtful sci-fi or just lasers and spaceships?`,
      });
    }
  }

  return prompts;
}

// =============================================================================
// Sassy Fallback Prompts (when no dynamic context available)
// =============================================================================

function getMovieFallbackPrompts(title: string): PromptConfig[] {
  return [
    { text: "Overhyped?", message: `Is ${title} overhyped or does it deserve the praise?` },
    { text: "Sell me on it", message: `Convince me to watch ${title}` },
    { text: "Hot take?", message: `Give me your spiciest take on ${title}` },
    { text: "Be honest", message: `Be brutally honest - is ${title} actually good?` },
    { text: "Roast it", message: `Roast ${title} for me` },
    { text: "Hype it up", message: `Hype ${title} up - make me excited to watch` },
    { text: "What's the vibe?", message: `What's the vibe of ${title}?` },
    { text: "Peak or mid?", message: `Is ${title} peak cinema or just mid?` },
    { text: "Who'd love this?", message: `What kind of person would absolutely love ${title}?` },
    { text: "Similar vibes?", message: `Find me something with similar vibes to ${title}` },
    { text: "Hidden gems in it?", message: `Any hidden details or easter eggs in ${title} I should look for?` },
  ];
}

function getSeriesFallbackPrompts(title: string): PromptConfig[] {
  return [
    { text: "Bingeworthy?", message: `Is ${title} actually bingeworthy or will I lose interest?` },
    { text: "Overhyped?", message: `Is ${title} overhyped or does it deserve the praise?` },
    { text: "Hot take?", message: `Give me your spiciest take on ${title}` },
    { text: "Be honest", message: `Be brutally honest - is ${title} worth starting?` },
    { text: "Roast it", message: `Roast ${title} for me` },
    { text: "Hype it up", message: `Hype ${title} up - make me want to binge it` },
    { text: "Peak TV?", message: `Is ${title} peak TV or just decent?` },
    { text: "Gets better?", message: `Does ${title} get better after the first few episodes?` },
    { text: "When to bail?", message: `At what point should I bail on ${title} if I'm not feeling it?` },
    { text: "Similar shows?", message: `What should I watch after finishing ${title}?` },
  ];
}

function getPersonFallbackPrompts(name?: string): PromptConfig[] {
  // Templates must stay grammatical without a name: `ref` sits in subject/object
  // position ("Is this person overrated?") and `poss` in possessive position
  // ("this person's best performance") — never bare "them"/"they" as subject.
  const ref = name || "this person";
  const poss = name ? `${name}'s` : "this person's";
  return [
    { text: "What're they up to?", message: `What is ${ref} working on now?` },
    { text: "Best performance?", message: `What's ${poss} best performance?` },
    { text: "Hidden gems?", message: `Any underrated movies by ${ref} I should watch?` },
    { text: "Hot take?", message: `What's your hot take on ${ref}?` },
    { text: "Career peak?", message: `Has ${ref} peaked or is their best work ahead?` },
    { text: "Overrated?", message: `Is ${ref} overrated or genuinely talented?` },
    { text: "Range check", message: `Does ${ref} have range or do they play the same character?` },
  ];
}

// =============================================================================
// Main Prompt Generation Functions
// =============================================================================

/**
 * Movie-specific prompts when on a movie detail page
 * Prioritizes: AI questions > dynamic contextual > sassy fallbacks
 */
export function getMovieDetailPrompts(
  title?: string,
  aiQuestions?: string[],
  mediaContext?: MediaContextState | null
): PromptConfig[] {
  const itemRef = title || "this movie";

  // Convert AI questions to prompt configs (highest priority)
  const aiPrompts: PromptConfig[] = (aiQuestions || []).slice(0, 3).map((q) => ({
    text: truncateForButton(q),
    message: q,
  }));

  // Generate dynamic prompts from context
  const dynamicPrompts = mediaContext ? generateDynamicPrompts(mediaContext) : [];

  // Sassy fallbacks
  const fallbackPrompts = getMovieFallbackPrompts(itemRef);

  // Build final prompt list: AI questions first, then dynamic, then fallbacks
  if (aiPrompts.length > 0) {
    const remaining = 4 - aiPrompts.length;
    // Mix dynamic and fallback for remaining slots
    const fillers =
      dynamicPrompts.length > 0
        ? [...pickRandom(dynamicPrompts, Math.min(2, remaining)), ...pickRandom(fallbackPrompts, remaining - 2)]
        : pickRandom(fallbackPrompts, remaining);
    return [...aiPrompts, ...fillers.slice(0, remaining)];
  }

  // No AI questions - prioritize dynamic, fill with fallbacks
  if (dynamicPrompts.length >= 2) {
    const dynamic = pickRandom(dynamicPrompts, 2);
    const fallback = pickRandom(fallbackPrompts, 2);
    return [...dynamic, ...fallback];
  }

  return pickRandom(fallbackPrompts, 4);
}

/**
 * Series-specific prompts when on a series detail page
 * Prioritizes: AI questions > dynamic contextual > sassy fallbacks
 */
export function getSeriesDetailPrompts(
  title?: string,
  aiQuestions?: string[],
  mediaContext?: MediaContextState | null
): PromptConfig[] {
  const itemRef = title || "this series";

  // Convert AI questions to prompt configs (highest priority)
  const aiPrompts: PromptConfig[] = (aiQuestions || []).slice(0, 3).map((q) => ({
    text: truncateForButton(q),
    message: q,
  }));

  // Generate dynamic prompts from context
  const dynamicPrompts = mediaContext ? generateDynamicPrompts(mediaContext) : [];

  // Sassy fallbacks
  const fallbackPrompts = getSeriesFallbackPrompts(itemRef);

  // Build final prompt list: AI questions first, then dynamic, then fallbacks
  if (aiPrompts.length > 0) {
    const remaining = 4 - aiPrompts.length;
    const fillers =
      dynamicPrompts.length > 0
        ? [...pickRandom(dynamicPrompts, Math.min(2, remaining)), ...pickRandom(fallbackPrompts, remaining - 2)]
        : pickRandom(fallbackPrompts, remaining);
    return [...aiPrompts, ...fillers.slice(0, remaining)];
  }

  // No AI questions - prioritize dynamic, fill with fallbacks
  if (dynamicPrompts.length >= 2) {
    const dynamic = pickRandom(dynamicPrompts, 2);
    const fallback = pickRandom(fallbackPrompts, 2);
    return [...dynamic, ...fallback];
  }

  return pickRandom(fallbackPrompts, 4);
}

/**
 * Person-specific prompts when on a person detail page
 */
export function getPersonDetailPrompts(name?: string): PromptConfig[] {
  return pickRandom(getPersonFallbackPrompts(name), 4);
}

/**
 * Landing page / homepage prompts
 */
export function getHomepagePrompts(): PromptConfig[] {
  const allPrompts: PromptConfig[] = [
    { text: "Surprise me", message: "Surprise me with something good" },
    { text: "What should I binge?", message: "What should I binge this weekend?" },
    { text: "Peak cinema", message: "Show me some peak cinema" },
    { text: "Underrated gems", message: "Show me some underrated gems" },
    { text: "Something wild", message: "Give me something wild and unexpected to watch" },
    { text: "Comfort watch", message: "I need a comfort watch" },
    { text: "Make me cry", message: "Recommend something that'll make me cry" },
    { text: "Mind-benders", message: "Show me some mind-bending movies" },
    { text: "90s nostalgia", message: "Give me some 90s nostalgia" },
    { text: "Foreign films", message: "Recommend some great foreign films" },
    { text: "Guilty pleasures", message: "What's a guilty pleasure movie I should watch?" },
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
 * Search page prompts
 */
export function getSearchPrompts(): PromptConfig[] {
  return [
    { text: "Refine my search", message: "Help me refine what I'm looking for" },
    { text: "Something different", message: "Show me something completely different" },
    { text: "More like these", message: "Find more movies like these results" },
    { text: "Narrow it down", message: "Help me narrow down my options" },
  ];
}

/**
 * Alias for getHomepagePrompts - used for browse pages
 */
export function getBrowsePrompts(): PromptConfig[] {
  return getHomepagePrompts();
}

/**
 * Get contextual prompts based on current page context and media context store
 */
export function getContextualPrompts(
  path: string | null,
  mediaContext: MediaContextState | null
): PromptConfig[] {
  if (!path) return getHomepagePrompts();

  const pathParts = path.split("/").filter(Boolean);
  const pageType = pathParts[0];

  // Movie detail page
  if (pageType === "movie" && mediaContext?.mediaType === "movie") {
    return getMovieDetailPrompts(mediaContext.title || undefined, mediaContext.aiQuestions || undefined, mediaContext);
  }

  // Series detail page
  if (pageType === "series" && mediaContext?.mediaType === "series") {
    return getSeriesDetailPrompts(
      mediaContext.title || undefined,
      mediaContext.aiQuestions || undefined,
      mediaContext
    );
  }

  // Person detail page — only trust the title if the context is actually a
  // person (a stale movie/series context during navigation would otherwise
  // produce "What is Inception working on now?")
  if (pageType === "person") {
    return getPersonDetailPrompts(
      mediaContext?.mediaType === "person" ? mediaContext.title || undefined : undefined
    );
  }

  // Search page
  if (pageType === "search") {
    return getSearchPrompts();
  }

  // Browse/topics pages
  if (pageType === "browse" || pageType === "topics") {
    return getBrowsePrompts();
  }

  return getHomepagePrompts();
}

// =============================================================================
// Idle Prompts (shown in the floating bubble - now uses contextual)
// =============================================================================

/**
 * Default idle prompts for homepage/generic pages
 * These are used when there's no specific media context
 */
export const IDLE_PROMPTS: PromptConfig[] = [
  { text: "What's trending?", message: "What's trending right now?" },
  { text: "Surprise me", message: "Surprise me with something good" },
  { text: "What should I watch?", message: "I'm bored - what should I watch tonight?" },
  { text: "Hidden gems?", message: "Show me some hidden gems I probably missed" },
];
