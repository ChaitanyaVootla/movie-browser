/**
 * Person → markdown. Pure. PG-only data (see data.ts LlmPerson).
 */

import type { LlmPerson } from "../data";
import {
  assembleSections,
  canonicalUrl,
  externalLinksSection,
  markdownUrl,
  oneLine,
  personImageSection,
  titleWithYear,
} from "./shared";

function detailsSection(person: LlmPerson): string | null {
  const lines: string[] = [];
  if (person.knownFor) lines.push(`- Known for: ${person.knownFor}`);
  if (person.birthday) lines.push(`- Born: ${person.birthday}`);
  if (person.deathday) lines.push(`- Died: ${person.deathday}`);
  if (person.placeOfBirth) lines.push(`- Place of birth: ${person.placeOfBirth}`);
  if (person.aliases.length) lines.push(`- Also known as: ${person.aliases.join(", ")}`);
  if (!lines.length) return null;
  return `## Details\n${lines.join("\n")}`;
}

function filmographySection(person: LlmPerson): string | null {
  if (!person.knownForCredits.length) return null;
  const lines = person.knownForCredits.map((c) => {
    const url = markdownUrl(c.mediaType, c.id, c.title);
    const label = titleWithYear(c.title, c.year);
    const role = c.role ? ` — ${c.role}` : "";
    return `- [${label}](${url})${role}`;
  });
  // When truncated, point agents to the full filmography on the person page.
  const more = person.filmographyTruncated
    ? `\n\n_Top ${person.knownForCredits.length} shown — [full filmography](${canonicalUrl(
        "person",
        person.id,
        person.name
      )})._`
    : "";
  return `## Known for\n${lines.join("\n")}${more}`;
}

export function personToMarkdown(person: LlmPerson): string {
  const heading = `# ${person.name}`;
  const summary = person.knownFor ? `> ${person.knownFor}` : null;
  const biography = person.biography ? `## Biography\n${oneLine(person.biography)}` : null;
  const canonical = `[View on The Movie Browser](${canonicalUrl("person", person.id, person.name)})`;

  return assembleSections([
    heading,
    summary,
    personImageSection(person.name, person.profilePath),
    biography,
    detailsSection(person),
    filmographySection(person),
    externalLinksSection("person", person.id, { homepage: person.homepage }),
    canonical,
  ]);
}
