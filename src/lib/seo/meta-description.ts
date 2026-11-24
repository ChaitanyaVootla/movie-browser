/**
 * Meta-description builders for the detail pages (movie / series / person).
 *
 * Pure, no I/O: called from `generateMetadata`, which must stay free of dynamic
 * APIs so the pages keep their ISR. Two problems found in a live SERP audit on
 * 2026-11-24 are fixed here, and both are invisible to typecheck:
 *
 * 1. AI hooks are written with markdown emphasis ("it's *their* sanity"), and
 *    0.4% of them (620 of 145,694) carried literal asterisks into the meta
 *    description, og:description and twitter:description.
 * 2. 1,009 of the 25,000 sitemapped people (4%) have a one-line TMDB biography
 *    ("Hiroya Shimizu is a Japanese actor.", 35 chars). Used as-is, that is a
 *    description Bing flags as too short and that says nothing a searcher wants.
 *    A short bio is now extended with the known-for titles and the page's intent.
 */
import { truncateAtWord } from "@/lib/utils";

/** Search engines show roughly 155-160 characters of a description. */
export const META_DESCRIPTION_MAX = 160;

/** A biography shorter than this is extended rather than used on its own. */
export const MIN_BIO_DESCRIPTION = 70;

/**
 * Drop inline markdown emphasis, keeping the words: `**a**`, `*a*`, `__a__`,
 * `_a_`, and inline code. Underscore emphasis only matches at word edges, so
 * snake_case and names like "Mr_Robot" are left alone.
 */
export function stripInlineMarkdown(text: string): string {
  return text
    .replace(/\*\*([^*\n]+)\*\*/g, "$1")
    .replace(/\*([^*\s][^*\n]*?)\*/g, "$1")
    .replace(/(^|[^\w])__([^_\n]+)__(?=$|[^\w])/g, "$1$2")
    .replace(/(^|[^\w])_([^_\s][^_\n]*?)_(?=$|[^\w])/g, "$1$2")
    .replace(/`([^`\n]+)`/g, "$1");
}

/**
 * Movie / series description: the watch-intent intro, then the AI hook (or the
 * TMDB overview), cut at a word boundary.
 */
export function watchDescription(intro: string, body: string | null | undefined): string {
  const clean = body ? stripInlineMarkdown(body).replace(/\s+/g, " ").trim() : "";
  return clean ? truncateAtWord(`${intro} ${clean}`, META_DESCRIPTION_MAX) : intro;
}

/** "A", "A and B", "A, B and C". */
function joinTitles(titles: string[]): string {
  if (titles.length <= 1) return titles[0] ?? "";
  return `${titles.slice(0, -1).join(", ")} and ${titles[titles.length - 1]}`;
}

export interface PersonDescriptionInput {
  name: string;
  biography?: string | null;
  /** Human job title, lower-case ("actor", "director"); null when unknown. */
  job?: string | null;
  /** Up to three known-for titles, most notable first. */
  knownFor?: string[];
}

const PERSON_OUTRO =
  "Explore their full filmography, photos, and where to watch their movies and shows.";

export function personDescription({
  name,
  biography,
  job,
  knownFor = [],
}: PersonDescriptionInput): string {
  const bio = biography ? biography.replace(/\s+/g, " ").trim() : "";
  if (bio.length >= MIN_BIO_DESCRIPTION) return truncateAtWord(bio, META_DESCRIPTION_MAX);

  const titles = knownFor.filter((t) => t.trim().length > 0).slice(0, 3);

  if (bio) {
    // The bio already says who they are ("X is a Japanese actor."), so add only
    // what it lacks: what they are known for, and what the page offers.
    const sentence = /[.!?…]$/.test(bio) ? bio : `${bio}.`;
    const known = titles.length > 0 ? ` Known for ${joinTitles(titles)}.` : "";
    return truncateAtWord(`${sentence}${known} ${PERSON_OUTRO}`, META_DESCRIPTION_MAX);
  }

  if (job) {
    const article = /^[aeiou]/.test(job) ? "an" : "a";
    const known = titles.length > 0 ? ` known for ${joinTitles(titles)}` : "";
    return truncateAtWord(
      `${name} is ${article} ${job}${known}. ${PERSON_OUTRO}`,
      META_DESCRIPTION_MAX,
    );
  }

  return `View ${name}'s full filmography, biography and photos, and find where to watch their movies and TV shows.`;
}
