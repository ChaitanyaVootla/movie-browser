/**
 * Write-time sanitize (spec §5 rung 1 + §6 step 6). Comment bodies are stored as
 * markdown-lite TEXT. We render them later with react-markdown + a restricted
 * allowedElements (NO dangerouslySetInnerHTML), so the stored body must contain NO
 * raw HTML — strip every tag here, keeping the text. This is defense-in-depth: even
 * if a renderer regression enabled rawHtml, nothing survived the write pass.
 */
import sanitizeHtml from "sanitize-html";

/** Strip ALL HTML tags + attributes; keep text content. Markdown syntax is plain text. */
export function sanitizeCommentBody(raw: string): string {
  const cleaned = sanitizeHtml(raw, {
    allowedTags: [],
    allowedAttributes: {},
    // Drop the CONTENT of these (e.g. <script>alert(1)</script> → nothing).
    nonTextTags: ["style", "script", "textarea", "noscript"],
  });
  // sanitize-html decodes entities; trim trailing/leading whitespace from stripping.
  return cleaned.trim();
}

/**
 * react-markdown allowlist shared by the read-only renderer (rich-text/rich-text-body.tsx).
 * NO `img`, `iframe`, `a`-as-raw, `html` — links are emitted via a custom `a`
 * component with rel="nofollow ugc noopener noreferrer". Spoiler tags are handled
 * by a remark pre-pass, not raw HTML.
 */
export const MARKDOWN_ALLOWED_ELEMENTS = [
  "p",
  "br",
  "strong",
  "em",
  "del",
  "blockquote",
  "code",
  "pre",
  "ul",
  "ol",
  "li",
  "a",
  "span",
] as const;
