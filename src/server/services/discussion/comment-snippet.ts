/**
 * Pure plain-text snippet extraction for a comment body. Used by the
 * detail-page COMMENT PEEK (and anywhere a one-line teaser of a body is shown).
 *
 * Comment bodies are markdown-lite plus three custom token shapes (see
 * `comment-body.tsx#tokenize`):
 *   - `[[movie|series|person|ep:id(:s:e)?|Label]]` entity mentions
 *   - `[spoiler]…[/spoiler]` inline-reveal blocks
 *   - `@username` user mentions
 * For a teaser we want the human-readable gist with NO markup, NO raw HTML, and
 * spoiler contents removed (a peek must never leak a spoiler the author hid).
 * The result is plain text safe to render as a normal string (React escapes it).
 */

const ENTITY_RE = /\[\[(?:movie|series|person|ep):[0-9]+(?::[0-9]+:[0-9]+)?\|([^\]]{0,120})\]\]/gi;
const SPOILER_RE = /\[spoiler\][\s\S]*?\[\/spoiler\]/gi;
// Markdown emphasis/code/heading/quote markers we strip for a flat teaser.
const MD_MARKERS_RE = /[*_`~#>]+/g;
// Markdown links `[text](url)` → keep the visible text only.
const MD_LINK_RE = /\[([^\]]*)\]\((?:[^)]*)\)/g;
// Bare URLs collapse to a short label so a teaser isn't dominated by a long URL.
const BARE_URL_RE = /https?:\/\/\S+/gi;

/**
 * Convert a raw comment body to a single-line plain-text teaser.
 * `maxLength` (default 140) truncates at a word boundary with an ellipsis.
 */
export function commentSnippet(body: string, maxLength = 140): string {
  const text = body
    // Drop hidden spoiler spans entirely — a teaser must not reveal them.
    .replace(SPOILER_RE, "")
    // Entity mentions → their visible label.
    .replace(ENTITY_RE, (_m, label: string) => label.trim())
    // Markdown links → visible text.
    .replace(MD_LINK_RE, (_m, label: string) => label)
    // Bare URLs → a neutral marker (avoids a wall of querystring in a teaser).
    .replace(BARE_URL_RE, "link")
    // Strip residual markdown emphasis/code/heading/quote markers.
    .replace(MD_MARKERS_RE, "")
    // Collapse all whitespace (incl. newlines) to single spaces.
    .replace(/\s+/g, " ")
    .trim();

  if (text.length <= maxLength) return text;
  const cut = text.slice(0, maxLength);
  const lastSpace = cut.lastIndexOf(" ");
  // Truncate at the last word boundary when one exists reasonably near the end.
  const base = lastSpace > maxLength * 0.6 ? cut.slice(0, lastSpace) : cut;
  return `${base.trimEnd()}…`;
}
