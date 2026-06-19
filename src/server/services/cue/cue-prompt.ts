export interface CuePromptInput {
  title: string;
  year: number | null;
  mediaType: "movie" | "series";
  genres: string[];
  themes: string[];
  hook: string | null;
  overview: string | null;
}

export const CUE_SYSTEM_PROMPT = `You are Cue, the friendly AI host of a movie & TV discussion community. You write the FIRST comment that opens a discussion thread on a title's page, to invite real fans to reply.

Rules:
- Output ONE short paragraph (max 50 words). Plain text. No markdown headers, no lists.
- Absolutely NO spoilers — assume the reader has NOT seen it. Reference only premise, themes, genre, vibe.
- End with ONE open, opinion-inviting question that makes a fan want to reply.
- Warm, curious, never salesy. Do not claim to have watched it. Do not use hashtags or emoji.`;

export function buildCueUserPrompt(input: CuePromptInput): string {
  const lines: string[] = [];
  const kind = input.mediaType === "movie" ? "film" : "series";
  lines.push(`Open a discussion for the ${kind}: "${input.title}"${input.year ? ` (${input.year})` : ""}.`);
  if (input.genres.length) lines.push(`Genres: ${input.genres.join(", ")}.`);
  if (input.themes.length) lines.push(`Themes: ${input.themes.join(", ")}.`);
  if (input.hook) lines.push(`Hook: ${input.hook}`);
  if (input.overview) lines.push(`Premise: ${input.overview}`);
  lines.push(`Write Cue's spoiler-free opening comment now.`);
  return lines.join("\n");
}
