// Shared rich-text editor module: generic Tiptap-based editor + read-only
// renderer extracted from the discussion feature so reviews + discussion share
// one editor. Anchored to a MediaAnchor (movie/series + optional season/episode).

export {
  mentionToToken,
  serializeToBody,
  type MentionKind,
  type MentionNodeAttrs,
  type EditorJSONNode,
  type EmojiResolver,
} from "./serialize";

export {
  flattenMentionResults,
  buildMentionExtension,
  resolveEmojiUnicode,
  insertEmojiByName,
  CommentEmojiExtension,
  SpoilerMark,
} from "./extensions";

export { useRichTextEditor } from "./use-rich-text-editor";
export { EmojiPicker } from "./emoji-picker";
export { RichTextToolbar } from "./toolbar";
export { EntityImagePicker } from "./entity-image-picker";
export { RichTextBody } from "./rich-text-body";
