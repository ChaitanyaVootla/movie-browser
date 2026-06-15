/**
 * Deterministic profanity/slur prefilter (spec §6 step 2). Runs BEFORE the LLM
 * gate in the create path: obvious slurs/profanity short-circuit to held without
 * spending a Bedrock call. Pairs with moderation/comment-gate.ts (borderline cases).
 * `obscenity` (MIT) handles leetspeak / unicode confusables / zero-width evasion and
 * uses word-boundary transforms to avoid the Scunthorpe problem.
 */
import {
  RegExpMatcher,
  englishDataset,
  englishRecommendedTransformers,
} from "obscenity";

const matcher = new RegExpMatcher({
  ...englishDataset.build(),
  ...englishRecommendedTransformers,
});

/** Pure: true when the text contains a matched profanity/slur. */
export function containsObscenity(text: string): boolean {
  if (!text) return false;
  return matcher.hasMatch(text);
}
