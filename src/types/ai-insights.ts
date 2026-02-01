/**
 * AI Insights Type Definitions and Validation
 *
 * This module provides strict type definitions and validation for the AI insights system.
 * It defines the schema for insight categories, subcategories, and constraints,
 * along with utilities for parsing and validating AI-generated content.
 *
 * @module ai-insights
 */

// =============================================================================
// INSIGHT SCHEMA DEFINITION
// =============================================================================

/**
 * The canonical schema for all AI insight categories.
 *
 * Each category can have:
 * - `subcategories`: Allowed subcategory values (null if no subcategories)
 * - `textConstraint`: For MOOD category, enforces specific text values per subcategory
 */
export const INSIGHT_SCHEMA = {
  VIBE: { subcategories: null, textConstraint: null },
  THEME: { subcategories: null, textConstraint: null },
  MOOD: {
    subcategories: ['pacing', 'intensity', 'tone', 'emotional'] as const,
    textConstraint: {
      pacing: ['slow', 'steady', 'fast'] as const,
      intensity: ['low', 'medium', 'high'] as const,
      tone: ['dark', 'light', 'mixed'] as const,
      emotional: ['light', 'medium', 'heavy'] as const,
    },
  },
  BEST_FOR: {
    subcategories: [
      'theatre',
      'streaming',
      'date_night',
      'solo',
      'friends',
      'family',
      'kids',
      'rewatch',
      'background',
      'binge',
    ] as const,
    textConstraint: null,
  },
  HIGHLIGHT: {
    subcategories: [
      'acting',
      'direction',
      'cinematography',
      'score',
      'sound',
      'vfx',
      'practical',
      'writing',
      'editing',
      'production',
      'costume',
      'stunt',
    ] as const,
    textConstraint: null,
  },
  HEADS_UP: {
    subcategories: [
      'violence',
      'gore',
      'disturbing',
      'triggers',
      'sad',
      'jumpscares',
      'language',
      'sexual',
      'drugs',
    ] as const,
    textConstraint: null,
  },
  QUESTION: {
    subcategories: ['pre_watch', 'post_watch'] as const,
    textConstraint: null,
  },
  DEEP_DIVE: {
    subcategories: ['trivia', 'insight', 'memorable', 'cultural'] as const,
    textConstraint: null,
  },
} as const;

// =============================================================================
// DERIVED TYPES
// =============================================================================

/**
 * Union type of all valid insight category keys.
 * @example 'VIBE' | 'THEME' | 'MOOD' | 'BEST_FOR' | ...
 */
export type InsightCategory = keyof typeof INSIGHT_SCHEMA;

/**
 * Helper type to extract subcategories for a given category.
 * Returns the tuple of subcategory strings, or null if no subcategories.
 */
type ExtractSubcategories<C extends InsightCategory> =
  (typeof INSIGHT_SCHEMA)[C]['subcategories'];

/**
 * Generic type to get the subcategory union for a category.
 * Returns `null` for categories without subcategories.
 */
export type SubcategoryFor<C extends InsightCategory> =
  ExtractSubcategories<C> extends readonly (infer U)[] ? U : null;

/**
 * Specific subcategory types for categories with defined subcategories.
 */
export type MoodSubcategory = SubcategoryFor<'MOOD'>;
export type BestForSubcategory = SubcategoryFor<'BEST_FOR'>;
export type HighlightSubcategory = SubcategoryFor<'HIGHLIGHT'>;
export type HeadsUpSubcategory = SubcategoryFor<'HEADS_UP'>;
export type QuestionSubcategory = SubcategoryFor<'QUESTION'>;
export type DeepDiveSubcategory = SubcategoryFor<'DEEP_DIVE'>;

/**
 * Union of all valid mood text values.
 * Used for MOOD category text constraints.
 */
export type MoodValue =
  | (typeof INSIGHT_SCHEMA.MOOD.textConstraint.pacing)[number]
  | (typeof INSIGHT_SCHEMA.MOOD.textConstraint.intensity)[number]
  | (typeof INSIGHT_SCHEMA.MOOD.textConstraint.tone)[number]
  | (typeof INSIGHT_SCHEMA.MOOD.textConstraint.emotional)[number];

/**
 * Specific mood value types for each mood subcategory.
 */
export type PacingValue =
  (typeof INSIGHT_SCHEMA.MOOD.textConstraint.pacing)[number];
export type IntensityValue =
  (typeof INSIGHT_SCHEMA.MOOD.textConstraint.intensity)[number];
export type ToneValue =
  (typeof INSIGHT_SCHEMA.MOOD.textConstraint.tone)[number];
export type EmotionalValue =
  (typeof INSIGHT_SCHEMA.MOOD.textConstraint.emotional)[number];

/**
 * Valid spoiler levels for insights.
 */
export type SpoilerLevel = 'none' | 'mild' | 'moderate' | 'heavy';

// =============================================================================
// INSIGHT INTERFACE
// =============================================================================

/**
 * A validated insight entry ready for database storage.
 */
export interface ValidatedInsight {
  category: InsightCategory;
  subcategory: string | null;
  text: string;
  spoilerLevel: SpoilerLevel;
  priority: number;
}

// =============================================================================
// VALIDATION
// =============================================================================

/**
 * Result of insight validation.
 */
export interface ValidationResult {
  valid: boolean;
  error?: string;
}

/**
 * Validates an insight against the schema.
 *
 * Checks:
 * 1. Category is valid
 * 2. Subcategory is valid for the category (or null if not required)
 * 3. Text matches constraints (for MOOD category)
 *
 * @param category - The insight category
 * @param subcategory - The subcategory (or null)
 * @param text - The insight text
 * @returns Validation result with error message if invalid
 *
 * @example
 * ```typescript
 * const result = validateInsight('MOOD', 'pacing', 'slow');
 * // { valid: true }
 *
 * const result = validateInsight('MOOD', 'pacing', 'invalid');
 * // { valid: false, error: 'Invalid text "invalid" for MOOD/pacing. Expected: slow, steady, fast' }
 * ```
 */
export function validateInsight(
  category: string,
  subcategory: string | null,
  text: string
): ValidationResult {
  // Check if category is valid
  if (!(category in INSIGHT_SCHEMA)) {
    return {
      valid: false,
      error: `Invalid category "${category}". Valid categories: ${Object.keys(INSIGHT_SCHEMA).join(', ')}`,
    };
  }

  const categoryKey = category as InsightCategory;
  const schema = INSIGHT_SCHEMA[categoryKey];

  // Check subcategory requirements
  if (schema.subcategories === null) {
    // Category doesn't use subcategories
    if (subcategory !== null) {
      return {
        valid: false,
        error: `Category "${category}" does not accept subcategories, but received "${subcategory}"`,
      };
    }
  } else {
    // Category requires a subcategory
    if (subcategory === null) {
      return {
        valid: false,
        error: `Category "${category}" requires a subcategory. Valid: ${schema.subcategories.join(', ')}`,
      };
    }

    // Check if subcategory is valid
    const validSubcategories = schema.subcategories as readonly string[];
    if (!validSubcategories.includes(subcategory)) {
      return {
        valid: false,
        error: `Invalid subcategory "${subcategory}" for category "${category}". Valid: ${validSubcategories.join(', ')}`,
      };
    }
  }

  // Check text constraints (only for MOOD category)
  if (categoryKey === 'MOOD' && subcategory !== null) {
    const moodSchema = INSIGHT_SCHEMA.MOOD;
    const subcategoryKey = subcategory as MoodSubcategory;

    if (
      subcategoryKey &&
      subcategoryKey in moodSchema.textConstraint
    ) {
      const validValues = moodSchema.textConstraint[
        subcategoryKey as keyof typeof moodSchema.textConstraint
      ] as readonly string[];

      if (!validValues.includes(text.toLowerCase())) {
        return {
          valid: false,
          error: `Invalid text "${text}" for ${category}/${subcategory}. Expected: ${validValues.join(', ')}`,
        };
      }
    }
  }

  // Check text is not empty
  if (!text || text.trim().length === 0) {
    return {
      valid: false,
      error: 'Insight text cannot be empty',
    };
  }

  return { valid: true };
}

// =============================================================================
// ICON MAPPING
// =============================================================================

/**
 * Maps subcategories to emoji icons for UI display.
 * Provides visual indicators for different insight types.
 */
export const SUBCATEGORY_ICONS: Record<string, string> = {
  // BEST_FOR subcategories
  theatre: '🎬',
  streaming: '📺',
  date_night: '💕',
  solo: '🧘',
  friends: '👥',
  family: '👨‍👩‍👧‍👦',
  kids: '👶',
  rewatch: '🔄',
  background: '🔊',
  binge: '📚',

  // HIGHLIGHT subcategories
  acting: '🎭',
  direction: '🎥',
  cinematography: '📷',
  score: '🎵',
  sound: '🔈',
  vfx: '✨',
  practical: '🎪',
  writing: '✍️',
  editing: '✂️',
  production: '🏗️',
  costume: '👗',
  stunt: '🤸',

  // HEADS_UP subcategories
  violence: '⚠️',
  gore: '🩸',
  disturbing: '😰',
  triggers: '⚡',
  sad: '😢',
  jumpscares: '👻',
  language: '🗣️',
  sexual: '🔞',
  drugs: '💊',

  // DEEP_DIVE subcategories
  trivia: '🎯',
  insight: '💡',
  memorable: '🎬',
  cultural: '🌍',

  // QUESTION subcategories
  pre_watch: '❓',
  post_watch: '🤔',

  // MOOD subcategories
  pacing: '⏱️',
  intensity: '🔥',
  tone: '🎨',
  emotional: '💔',
};

/**
 * Gets the icon for a given subcategory.
 *
 * @param subcategory - The subcategory to get an icon for
 * @returns The emoji icon, or null if no icon is defined
 *
 * @example
 * ```typescript
 * getIconForInsight('theatre');  // '🎬'
 * getIconForInsight('acting');   // '🎭'
 * getIconForInsight(null);       // null
 * getIconForInsight('unknown');  // null
 * ```
 */
export function getIconForInsight(subcategory: string | null): string | null {
  if (subcategory === null) {
    return null;
  }
  return SUBCATEGORY_ICONS[subcategory] ?? null;
}

/**
 * Gets the icon for a category (uses a default icon per category).
 */
export const CATEGORY_ICONS: Record<InsightCategory, string> = {
  VIBE: '✨',
  THEME: '📖',
  MOOD: '🎭',
  BEST_FOR: '🎯',
  HIGHLIGHT: '⭐',
  HEADS_UP: '⚠️',
  QUESTION: '❓',
  DEEP_DIVE: '🔍',
};

// =============================================================================
// RAW AI OUTPUT INTERFACE
// =============================================================================

/**
 * Raw output structure from the AI/LLM response.
 * This represents the unvalidated data before parsing and validation.
 */
export interface RawAIOutput {
  /** One-liner hook/tagline for the content */
  hook: string;

  /** List of vibe descriptors (e.g., "atmospheric", "nostalgic") */
  vibes: string[];

  /** List of thematic elements */
  themes: string[];

  /** Mood assessment with specific subcategories */
  mood: {
    pacing: string;
    intensity: string;
    tone: string;
    emotional: string;
  };

  /** Best viewing contexts */
  bestFor: Array<{
    subcategory: string;
    text: string;
  }>;

  /** Production/creative highlights */
  highlights: Array<{
    subcategory: string;
    text: string;
  }>;

  /** Content warnings and advisories */
  headsUp: Array<{
    subcategory: string;
    text: string;
  }>;

  /** Discussion questions for before/after viewing */
  questions: {
    preWatch: string[];
    postWatch: string[];
  };

  /** Deep dive content with spoiler levels */
  deepDive: Array<{
    subcategory: string;
    text: string;
    spoilerLevel: string;
  }>;
}

// =============================================================================
// PARSER FUNCTION
// =============================================================================

/**
 * Result of parsing and validating raw AI output.
 */
export interface ParseResult {
  /** Successfully validated insights */
  insights: ValidatedInsight[];

  /** Validation errors encountered during parsing */
  errors: string[];
}

/**
 * Validates a spoiler level string and normalizes it.
 *
 * @param level - The spoiler level to validate
 * @returns Normalized spoiler level or 'none' if invalid
 */
function normalizeSpoilerLevel(level: string | undefined): SpoilerLevel {
  const normalized = level?.toLowerCase();
  if (
    normalized === 'none' ||
    normalized === 'mild' ||
    normalized === 'moderate' ||
    normalized === 'heavy'
  ) {
    return normalized;
  }
  return 'none';
}

/**
 * Parses and validates raw AI output into structured insights.
 *
 * Processes all categories from the raw output, validates each insight
 * against the schema, and returns both valid insights and any errors.
 *
 * @param raw - The raw AI output to parse
 * @returns Object containing validated insights and any errors
 *
 * @example
 * ```typescript
 * const raw: RawAIOutput = {
 *   hook: "A thrilling adventure",
 *   vibes: ["exciting", "nostalgic"],
 *   themes: ["friendship", "sacrifice"],
 *   mood: { pacing: "fast", intensity: "high", tone: "mixed", emotional: "medium" },
 *   bestFor: [{ subcategory: "theatre", text: "Best experienced on the big screen" }],
 *   highlights: [{ subcategory: "vfx", text: "Stunning visual effects" }],
 *   headsUp: [{ subcategory: "violence", text: "Intense action sequences" }],
 *   questions: { preWatch: ["What's your take?"], postWatch: ["Did you expect that?"] },
 *   deepDive: [{ subcategory: "trivia", text: "Fun fact", spoilerLevel: "none" }],
 * };
 *
 * const { insights, errors } = parseAndValidateAIOutput(raw);
 * ```
 */
export function parseAndValidateAIOutput(raw: RawAIOutput): ParseResult {
  const insights: ValidatedInsight[] = [];
  const errors: string[] = [];

  let priorityCounter = 1;

  /**
   * Helper to add an insight after validation.
   */
  function addInsight(
    category: InsightCategory,
    subcategory: string | null,
    text: string,
    spoilerLevel: SpoilerLevel = 'none'
  ): void {
    const validation = validateInsight(category, subcategory, text);

    if (validation.valid) {
      insights.push({
        category,
        subcategory,
        text: text.trim(),
        spoilerLevel,
        priority: priorityCounter++,
      });
    } else {
      errors.push(validation.error ?? 'Unknown validation error');
    }
  }

  // Parse VIBE entries
  if (Array.isArray(raw.vibes)) {
    for (const vibe of raw.vibes) {
      if (typeof vibe === 'string' && vibe.trim()) {
        addInsight('VIBE', null, vibe);
      }
    }
  }

  // Parse THEME entries
  if (Array.isArray(raw.themes)) {
    for (const theme of raw.themes) {
      if (typeof theme === 'string' && theme.trim()) {
        addInsight('THEME', null, theme);
      }
    }
  }

  // Parse MOOD entries
  if (raw.mood && typeof raw.mood === 'object') {
    const moodSubcategories: MoodSubcategory[] = [
      'pacing',
      'intensity',
      'tone',
      'emotional',
    ];

    for (const sub of moodSubcategories) {
      if (sub && sub in raw.mood) {
        const value = raw.mood[sub as keyof typeof raw.mood];
        if (typeof value === 'string' && value.trim()) {
          addInsight('MOOD', sub, value.toLowerCase());
        }
      }
    }
  }

  // Parse BEST_FOR entries
  if (Array.isArray(raw.bestFor)) {
    for (const item of raw.bestFor) {
      if (
        item &&
        typeof item.subcategory === 'string' &&
        typeof item.text === 'string'
      ) {
        addInsight('BEST_FOR', item.subcategory, item.text);
      }
    }
  }

  // Parse HIGHLIGHT entries
  if (Array.isArray(raw.highlights)) {
    for (const item of raw.highlights) {
      if (
        item &&
        typeof item.subcategory === 'string' &&
        typeof item.text === 'string'
      ) {
        addInsight('HIGHLIGHT', item.subcategory, item.text);
      }
    }
  }

  // Parse HEADS_UP entries
  if (Array.isArray(raw.headsUp)) {
    for (const item of raw.headsUp) {
      if (
        item &&
        typeof item.subcategory === 'string' &&
        typeof item.text === 'string'
      ) {
        addInsight('HEADS_UP', item.subcategory, item.text);
      }
    }
  }

  // Parse QUESTION entries
  if (raw.questions && typeof raw.questions === 'object') {
    // Pre-watch questions
    if (Array.isArray(raw.questions.preWatch)) {
      for (const question of raw.questions.preWatch) {
        if (typeof question === 'string' && question.trim()) {
          addInsight('QUESTION', 'pre_watch', question);
        }
      }
    }

    // Post-watch questions
    if (Array.isArray(raw.questions.postWatch)) {
      for (const question of raw.questions.postWatch) {
        if (typeof question === 'string' && question.trim()) {
          addInsight('QUESTION', 'post_watch', question);
        }
      }
    }
  }

  // Parse DEEP_DIVE entries
  if (Array.isArray(raw.deepDive)) {
    for (const item of raw.deepDive) {
      if (
        item &&
        typeof item.subcategory === 'string' &&
        typeof item.text === 'string'
      ) {
        const spoilerLevel = normalizeSpoilerLevel(item.spoilerLevel);
        const validation = validateInsight('DEEP_DIVE', item.subcategory, item.text);

        if (validation.valid) {
          insights.push({
            category: 'DEEP_DIVE',
            subcategory: item.subcategory,
            text: item.text.trim(),
            spoilerLevel,
            priority: priorityCounter++,
          });
        } else {
          errors.push(validation.error ?? 'Unknown validation error');
        }
      }
    }
  }

  return { insights, errors };
}

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

/**
 * Gets all valid categories.
 */
export function getAllCategories(): InsightCategory[] {
  return Object.keys(INSIGHT_SCHEMA) as InsightCategory[];
}

/**
 * Gets subcategories for a given category.
 *
 * @param category - The category to get subcategories for
 * @returns Array of subcategory strings, or null if no subcategories
 */
export function getSubcategoriesFor(
  category: InsightCategory
): readonly string[] | null {
  return INSIGHT_SCHEMA[category].subcategories;
}

/**
 * Checks if a category has subcategories.
 */
export function hasSubcategories(category: InsightCategory): boolean {
  return INSIGHT_SCHEMA[category].subcategories !== null;
}

/**
 * Checks if a category has text constraints.
 */
export function hasTextConstraints(category: InsightCategory): boolean {
  return INSIGHT_SCHEMA[category].textConstraint !== null;
}

/**
 * Type guard to check if a string is a valid InsightCategory.
 */
export function isValidCategory(value: string): value is InsightCategory {
  return value in INSIGHT_SCHEMA;
}

/**
 * Type guard to check if a string is a valid subcategory for a category.
 */
export function isValidSubcategory(
  category: InsightCategory,
  subcategory: string
): boolean {
  const schema = INSIGHT_SCHEMA[category];
  if (schema.subcategories === null) {
    return false;
  }
  return (schema.subcategories as readonly string[]).includes(subcategory);
}
