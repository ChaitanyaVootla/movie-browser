/**
 * Pure serialization: Tiptap editor JSON (ProseMirror doc) → the canonical comment
 * body string the backend already expects. This is the LOAD-BEARING contract that
 * keeps `createComment`, the write-time sanitizer, `parseEntityMentions`/`parseMentions`
 * (src/server/services/discussion/mentions.ts), and the read-time `comment-body.tsx`
 * renderer all working unchanged.
 *
 * Token grammar (must match mentions.ts ENTITY_RE / MENTION_RE exactly):
 *   user mention   → `@username`
 *   movie entity   → `[[movie:ID|Name]]`
 *   series entity  → `[[series:ID|Name]]`
 *   person entity  → `[[person:ID|Name]]`
 *   episode entity → `[[ep:SERIESID:SEASON:EP|Name]]`
 *   emoji          → the unicode char (e.g. "😄") — comment-body renders unicode natively
 *   hard break     → "\n"
 *   paragraph gap  → "\n\n"
 *
 * No React / DOM / editor-instance deps — unit-testable in isolation.
 */

/** The kinds an @-mention chip can carry. "user" serializes to @username. */
export type MentionKind = "user" | "movie" | "series" | "person" | "episode";

/** Attributes stored on the custom Tiptap mention node (see extensions). */
export interface MentionNodeAttrs {
  kind: MentionKind;
  /** For user: the username. For entity: the TMDB id (movie/series/person) or the SERIES id (episode). */
  id: string;
  /** Display label (catalog name / username without @). */
  label: string;
  /** Episode-only natural-key parts. */
  season?: number | null;
  episode?: number | null;
}

/**
 * Minimal structural view of a ProseMirror/Tiptap JSON node. We only read the
 * shapes we emit (doc → paragraph → text|mention|emoji|hardBreak), so a narrow
 * recursive type is both sufficient and `any`-free.
 */
export interface EditorJSONNode {
  type?: string;
  text?: string;
  attrs?: Record<string, unknown>;
  content?: EditorJSONNode[];
}

/** Resolve an emoji node's stored `name` to its unicode character. */
export type EmojiResolver = (name: string) => string | undefined;

function isString(v: unknown): v is string {
  return typeof v === "string";
}

function toFiniteInt(v: unknown): number | null {
  if (typeof v === "number" && Number.isInteger(v)) return v;
  if (typeof v === "string" && /^\d+$/.test(v)) return Number(v);
  return null;
}

/** Build the canonical `[[...]]` / `@user` token for a mention node's attrs. */
export function mentionToToken(attrs: MentionNodeAttrs): string {
  const label = attrs.label.replace(/\]/g, ""); // ENTITY_RE forbids ']' in the name
  switch (attrs.kind) {
    case "user":
      // id holds the username for user mentions; strip a leading @ if present.
      return `@${attrs.id.replace(/^@/, "")}`;
    case "movie":
    case "series":
    case "person":
      return `[[${attrs.kind}:${attrs.id}|${label}]]`;
    case "episode": {
      const season = toFiniteInt(attrs.season);
      const episode = toFiniteInt(attrs.episode);
      // Defensive: an episode without its natural-key parts can't form a valid
      // token — fall back to a plain label so we never emit a malformed `[[ep:...]]`.
      if (season === null || episode === null) return label;
      return `[[ep:${attrs.id}:${season}:${episode}|${label}]]`;
    }
  }
}

function readMentionAttrs(attrs: Record<string, unknown> | undefined): MentionNodeAttrs | null {
  if (!attrs) return null;
  const kind = attrs.kind;
  const id = attrs.id;
  const label = attrs.label;
  if (!isString(kind)) return null;
  if (!isString(id) && typeof id !== "number") return null;
  const validKinds: MentionKind[] = ["user", "movie", "series", "person", "episode"];
  if (!validKinds.includes(kind as MentionKind)) return null;
  return {
    kind: kind as MentionKind,
    id: String(id),
    label: isString(label) ? label : String(id),
    season: toFiniteInt(attrs.season),
    episode: toFiniteInt(attrs.episode),
  };
}

/** A single Tiptap mark as it appears on a text node's `marks` array. */
interface MarkJSON {
  type?: string;
}

function readMarkTypes(marks: unknown): string[] {
  if (!Array.isArray(marks)) return [];
  const out: string[] = [];
  for (const m of marks as MarkJSON[]) {
    if (m && typeof m.type === "string") out.push(m.type);
  }
  return out;
}

/**
 * Wrap a text node's raw text in its marks' canonical body tokens. Today only
 * the `spoiler` mark serializes — wrapping OUTERMOST in `[spoiler]…[/spoiler]`
 * (the canonical inline-spoiler token the read-time renderer `rich-text-body.tsx`
 * already parses as a tap-to-reveal span). Other inline marks (bold/italic/…)
 * are intentionally NOT emitted here: the body string is markdown-lite and those
 * are not part of the established token grammar, so they pass through as plain
 * text exactly as before — adding them is a separate, out-of-scope change.
 */
function applyMarks(text: string, markTypes: string[]): string {
  let out = text;
  if (markTypes.includes("spoiler")) out = `[spoiler]${out}[/spoiler]`;
  return out;
}

/** Serialize the inline content of a single block (paragraph) to a string. */
function serializeInline(nodes: EditorJSONNode[] | undefined, resolveEmoji: EmojiResolver): string {
  if (!nodes) return "";
  let out = "";
  for (const node of nodes) {
    switch (node.type) {
      case "text": {
        const raw = node.text ?? "";
        const marks = readMarkTypes((node as { marks?: unknown }).marks);
        out += marks.length ? applyMarks(raw, marks) : raw;
        break;
      }
      case "hardBreak":
        out += "\n";
        break;
      case "mention": {
        const attrs = readMentionAttrs(node.attrs);
        if (attrs) out += mentionToToken(attrs);
        break;
      }
      case "emoji": {
        const name = node.attrs?.name;
        const unicode = isString(name) ? resolveEmoji(name) : undefined;
        // If the runtime can't render it, the extension may have inserted a literal
        // node with no unicode mapping — fall back to the shortcode so the body is
        // never lossy/empty.
        out += unicode ?? (isString(name) ? `:${name}:` : "");
        break;
      }
      default:
        // Unknown inline node with children (defensive) — recurse.
        if (node.content) out += serializeInline(node.content, resolveEmoji);
        break;
    }
  }
  return out;
}

/**
 * Serialize a full Tiptap doc to the canonical body string.
 * Paragraphs are joined with a blank line ("\n\n"); empty trailing paragraphs are
 * trimmed so a stray return at the end never produces a spurious newline.
 */
export function serializeToBody(doc: EditorJSONNode | null | undefined, resolveEmoji: EmojiResolver): string {
  if (!doc?.content) return "";
  const blocks: string[] = [];
  for (const block of doc.content) {
    if (block.type === "paragraph") {
      blocks.push(serializeInline(block.content, resolveEmoji));
    } else if (block.content) {
      // Other block types (none expected from StarterKit-minimal) — flatten.
      blocks.push(serializeInline(block.content, resolveEmoji));
    }
  }
  // Drop empty leading/trailing blocks; collapse to "\n\n" paragraph separators.
  while (blocks.length && blocks[blocks.length - 1].trim() === "") blocks.pop();
  while (blocks.length && blocks[0].trim() === "") blocks.shift();
  return blocks.join("\n\n");
}
