"use client";

import { ReactRenderer, ReactNodeViewRenderer } from "@tiptap/react";
import type { Editor } from "@tiptap/react";
import Mention from "@tiptap/extension-mention";
import { Emoji, gitHubEmojis } from "@tiptap/extension-emoji";
import type { SuggestionOptions, SuggestionProps, SuggestionKeyDownProps } from "@tiptap/suggestion";
import { computePosition, flip, shift, offset, type VirtualElement } from "@floating-ui/dom";
import { searchMentionEntities } from "@/server/actions/discussion-search";
import type { DiscussionAnchor } from "@/server/services/discussion/comment-schemas";
import type { MentionSearchResultDto } from "@/types/social";
import { CommentMentionChip } from "./comment-mention-chip";
import {
  MentionSuggestionList,
  type MentionSuggestionItem,
  type MentionListHandle,
} from "./mention-suggestion-list";
import { EmojiSuggestionListView, type EmojiSuggestion } from "./emoji-suggestion-list";

const TMDB_IMAGE_BASE = process.env.NEXT_PUBLIC_TMDB_IMAGE_BASE ?? "https://image.tmdb.org/t/p";

/** Flatten the sectioned search DTO into the ordered suggestion item list. */
export function flattenMentionResults(results: MentionSearchResultDto | null): MentionSuggestionItem[] {
  if (!results) return [];
  const items: MentionSuggestionItem[] = [];
  for (const u of results.people) {
    items.push({
      key: `user-${u.username}`,
      section: "People",
      label: u.username,
      sublabel: u.name ?? undefined,
      imageSrc: u.image ?? undefined,
      attrs: { kind: "user", id: u.username, label: u.username, imageSrc: u.image },
    });
  }
  for (const t of results.titles) {
    const imageSrc = t.imagePath ? `${TMDB_IMAGE_BASE}/w92${t.imagePath}` : undefined;
    items.push({
      key: `title-${t.kind}-${t.tmdbId}`,
      section: "Titles",
      label: t.name,
      sublabel: t.year ? String(t.year) : undefined,
      imageSrc,
      attrs: { kind: t.kind, id: String(t.tmdbId), label: t.name, imageSrc: imageSrc ?? null },
    });
  }
  for (const p of results.cast) {
    const imageSrc = p.imagePath ? `${TMDB_IMAGE_BASE}/w45${p.imagePath}` : undefined;
    items.push({
      key: `person-${p.tmdbId}`,
      section: "Cast / People",
      label: p.name,
      imageSrc,
      attrs: { kind: "person", id: String(p.tmdbId), label: p.name, imageSrc: imageSrc ?? null },
    });
  }
  for (const e of results.episodes) {
    const imageSrc = e.imagePath ? `${TMDB_IMAGE_BASE}/w227_and_h127_bestv2${e.imagePath}` : undefined;
    items.push({
      key: `ep-${e.seriesId}-${e.seasonNumber}-${e.episodeNumber}`,
      section: "Episodes",
      label: e.name,
      sublabel: `S${e.seasonNumber}E${e.episodeNumber}`,
      imageSrc,
      attrs: {
        kind: "episode",
        id: String(e.seriesId),
        label: e.name,
        season: e.seasonNumber,
        episode: e.episodeNumber,
        imageSrc: imageSrc ?? null,
      },
    });
  }
  return items;
}

/** Position the suggestion popup against the caret via floating-ui. */
function makeVirtualEl(getRect: (() => DOMRect | null) | undefined): VirtualElement {
  return {
    getBoundingClientRect: () =>
      getRect?.() ?? new DOMRect(0, 0, 0, 0),
  };
}

// A React list component usable as a suggestion popup: forwards a MentionListHandle
// and accepts at least { items, command }. Both our lists satisfy this.
type SuggestionListComponent<Item> = React.ForwardRefExoticComponent<
  { items: Item[]; command: (item: Item) => void } & React.RefAttributes<MentionListHandle> &
    Record<string, unknown>
>;

/**
 * Shared `render()` factory for a Tiptap suggestion: mounts the React list,
 * positions it with floating-ui above/below the caret, and forwards key events.
 * `extraProps` lets a list receive constants (e.g. the mention list's `loading`).
 */
function makeSuggestionRender<Item>(
  ListComponent: SuggestionListComponent<Item>,
  extraProps: Record<string, unknown> = {}
): SuggestionOptions<Item>["render"] {
  return () => {
    let renderer: ReactRenderer<MentionListHandle> | null = null;
    let popup: HTMLDivElement | null = null;

    const reposition = (clientRect: (() => DOMRect | null) | null | undefined) => {
      if (!popup || !clientRect) return;
      void computePosition(makeVirtualEl(clientRect ?? undefined), popup, {
        placement: "bottom-start",
        middleware: [offset(6), flip({ fallbackPlacements: ["top-start"] }), shift({ padding: 8 })],
      }).then(({ x, y }) => {
        if (!popup) return;
        Object.assign(popup.style, { left: `${x}px`, top: `${y}px` });
      });
    };

    const propsFor = (p: SuggestionProps<Item>) => ({
      ...extraProps,
      items: p.items,
      command: (item: Item) => p.command(item),
    });

    return {
      onStart: (props: SuggestionProps<Item>) => {
        renderer = new ReactRenderer(ListComponent, { props: propsFor(props), editor: props.editor });
        popup = document.createElement("div");
        popup.style.position = "absolute";
        popup.style.zIndex = "60";
        popup.appendChild(renderer.element);
        document.body.appendChild(popup);
        reposition(props.clientRect);
      },
      onUpdate: (props: SuggestionProps<Item>) => {
        renderer?.updateProps(propsFor(props));
        reposition(props.clientRect);
      },
      onKeyDown: (props: SuggestionKeyDownProps): boolean => {
        if (props.event.key === "Escape") return true;
        return renderer?.ref?.onKeyDown(props.event) ?? false;
      },
      onExit: () => {
        popup?.remove();
        popup = null;
        renderer?.destroy();
        renderer = null;
      },
    };
  };
}

/**
 * Build the custom `@` Mention extension for a given discussion anchor. Carries
 * rich attrs ({kind,id,label,season,episode,imageSrc}) so it serializes to the
 * exact `@user` / `[[...]]` token grammar AND renders the atomic chip node view.
 * `atom: true` makes a single Backspace remove the whole chip.
 */
export function buildMentionExtension(anchor: DiscussionAnchor) {
  return Mention.extend({
    atom: true,
    addAttributes() {
      return {
        kind: { default: "user" },
        id: { default: null },
        label: { default: null },
        season: { default: null },
        episode: { default: null },
        imageSrc: { default: null },
      };
    },
    addNodeView() {
      return ReactNodeViewRenderer(CommentMentionChip);
    },
  }).configure({
    // The serialized body is produced from editor JSON via serializeToBody, but
    // renderText keeps copy/paste + accessibility text sane (plain label, not [object]).
    renderText({ node }) {
      const a = node.attrs as { kind?: string; label?: string };
      return a.kind === "user" ? `@${a.label ?? ""}` : (a.label ?? "");
    },
    suggestion: {
      char: "@",
      // Allow spaces inside the query so multi-word titles/people match.
      allowSpaces: true,
      items: async ({ query }: { query: string }): Promise<MentionSuggestionItem[]> => {
        if (query.trim().length < 1) return [];
        const res = await searchMentionEntities({ query: query.trim(), anchor });
        return flattenMentionResults(res);
      },
      render: makeSuggestionRender<MentionSuggestionItem>(MentionSuggestionList, { loading: false }),
    },
  });
}

/** name → unicode resolver for the gitHubEmojis set used by the editor. */
const EMOJI_BY_NAME: Map<string, string> = new Map(
  gitHubEmojis.flatMap((e) => (e.emoji ? [[e.name, e.emoji] as const] : []))
);

/** Resolve an emoji node's stored `name` to its unicode char (for serializeToBody). */
export function resolveEmojiUnicode(name: string): string | undefined {
  return EMOJI_BY_NAME.get(name);
}

/** Rank emoji matches: prefer a shortcode that STARTS with the query, then tags. */
function searchEmojis(query: string): EmojiSuggestion[] {
  const q = query.toLowerCase().trim();
  if (!q) return [];
  const starts: EmojiSuggestion[] = [];
  const contains: EmojiSuggestion[] = [];
  for (const e of gitHubEmojis) {
    if (!e.emoji) continue;
    const item: EmojiSuggestion = {
      name: e.name,
      emoji: e.emoji,
      shortcodes: e.shortcodes,
      fallbackImage: e.fallbackImage,
    };
    if (e.shortcodes.some((s) => s.startsWith(q))) starts.push(item);
    else if (e.shortcodes.some((s) => s.includes(q)) || e.tags.some((t) => t.includes(q))) contains.push(item);
    if (starts.length >= 8) break;
  }
  return [...starts, ...contains].slice(0, 8);
}

/** The `:`-triggered emoji extension (suggestion + node), gitHubEmojis dataset. */
export const CommentEmojiExtension = Emoji.configure({
  emojis: gitHubEmojis,
  enableEmoticons: true,
  suggestion: {
    items: ({ query }: { query: string }) => searchEmojis(query),
    render: makeSuggestionRender<EmojiSuggestion>(EmojiSuggestionListView),
  },
});

/** Insert an emoji by shortcode from the picker button (uses the extension command). */
export function insertEmojiByName(editor: Editor, name: string): void {
  editor.chain().focus().setEmoji(name).run();
}
