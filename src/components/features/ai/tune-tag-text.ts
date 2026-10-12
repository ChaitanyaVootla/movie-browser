/**
 * Display-text half of the `[TUNE:…]` tag (taste v2 §5.2): no imports, so the
 * chat views can strip the tag eagerly while the pill + token converter load
 * lazily (tune-tag-slot.tsx).
 */
const TUNE_TAG_ALL_RE = /\[TUNE:[^\]]*\]/gi;
/** A tag still arriving at the end of a streaming message ("[TU", "[TUNE:seri"). */
const PARTIAL_TAIL_RE = /\[(?:T(?:U(?:N(?:E(?::[^\]]*)?)?)?)?)?$/i;

/** Remove every `[TUNE:…]` tag (and a partial one at the end while streaming) from display text. */
export function stripTuneTag(content: string): string {
  return content.replace(TUNE_TAG_ALL_RE, "").replace(PARTIAL_TAIL_RE, "");
}
