/**
 * Shared AI-insights markdown rendering. Pure.
 *
 * SPOILER SAFETY: this module reads ONLY `aiData.insights.spoilerFree.*`,
 * `aiData.hook`, and `aiData.mood`. It MUST NEVER touch
 * `aiData.insights.spoilerContent` (post-watch questions / deep dives) — those
 * carry reveals and are excluded from every `.md` surface.
 */

import type { AIDataResponse } from "@/server/services/ai-data-service";
import { oneLine } from "./shared";

/** One-line mood descriptor for the Details section, or null if no mood data. */
export function moodLine(aiData: AIDataResponse | null): string | null {
  const mood = aiData?.mood;
  if (!mood) return null;
  const bits = [mood.pacing, mood.intensity, mood.tone, mood.emotional].filter(
    (v): v is string => Boolean(v)
  );
  if (!bits.length) return null;
  return `- Mood: ${bits.join(", ")}`;
}

/**
 * The `## AI insights` section built from SPOILER-FREE fields only.
 * Returns null when there is nothing spoiler-free to show.
 */
export function aiInsightsSection(aiData: AIDataResponse | null): string | null {
  if (!aiData) return null;
  const free = aiData.insights.spoilerFree;
  const lines: string[] = [];

  if (aiData.hook) lines.push(`- Hook: ${oneLine(aiData.hook)}`);
  if (free.themes.length) lines.push(`- Themes: ${free.themes.join(", ")}`);
  if (free.vibes.length) lines.push(`- Vibes: ${free.vibes.join(", ")}`);
  if (free.bestFor.length) {
    lines.push(`- Best for: ${free.bestFor.map((b) => b.text).join(", ")}`);
  }
  if (free.highlights.length) {
    lines.push(`- Standout: ${free.highlights.map((h) => h.text).join(", ")}`);
  }
  if (free.headsUp.length) {
    lines.push(`- Heads up: ${free.headsUp.map((h) => h.text).join(", ")}`);
  }

  if (!lines.length) return null;
  return `## AI insights\n${lines.join("\n")}`;
}
