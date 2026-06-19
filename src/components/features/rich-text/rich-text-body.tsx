"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Components } from "react-markdown";
import type { EntityMentionRef } from "@/server/db/postgres/comments";
import { MARKDOWN_ALLOWED_ELEMENTS } from "@/server/services/discussion/sanitize-comment";

/**
 * Recognized render statuses controlling the deleted/pending notices.
 * Documented as a union, but the prop accepts any `string` because callers'
 * status fields are stringly-typed (e.g. CommentDto.status); unrecognized
 * values render as a normal published body.
 */
export type RichTextStatus =
  | "PUBLISHED"
  | "PENDING_REVIEW"
  | "FLAGGED"
  | "REMOVED"
  | "DELETED_BY_USER";

const TMDB_IMAGE_BASE = process.env.NEXT_PUBLIC_TMDB_IMAGE_BASE ?? "https://image.tmdb.org/t/p";


/** Inline reveal for a [spoiler]…[/spoiler] span — independent of the watch-gate. */
function InlineSpoiler({ text }: { text: string }) {
  const [revealed, setRevealed] = useState(false);
  if (revealed) return <span className="rounded bg-muted px-1">{text}</span>;
  return (
    <button
      type="button"
      onClick={() => setRevealed(true)}
      className="inline-flex min-h-0 items-center rounded bg-foreground/10 px-2 py-0.5 text-xs font-medium text-muted-foreground hover:bg-foreground/20"
    >
      Reveal spoiler
    </button>
  );
}

/** Build a lookup map from entity mention refs keyed by canonical token key. */
function buildMentionMap(refs: EntityMentionRef[]): Map<string, EntityMentionRef> {
  const map = new Map<string, EntityMentionRef>();
  for (const r of refs) {
    const key =
      r.kind === "episode"
        ? `ep:${r.tmdbId}:${r.seasonNumber}:${r.episodeNumber}`
        : `${r.kind === "person" ? "person" : r.kind}:${r.tmdbId}`;
    map.set(key, r);
  }
  return map;
}

type Token =
  | { type: "text"; value: string }
  | { type: "entity"; key: string; fallbackLabel: string }
  | { type: "user"; username: string }
  | { type: "spoiler"; text: string };

/**
 * Split a body string into a list of tokens: plain text, entity refs,
 * @user mentions, and [spoiler] blocks. Pure function, no React deps.
 */
function tokenize(body: string): Token[] {
  const combined = new RegExp(
    `(\\[\\[(?:movie|series|person|ep):[0-9]+(?::[0-9]+:[0-9]+)?\\|[^\\]]{0,120}\\]\\])|` +
    `(\\[spoiler\\][\\s\\S]*?\\[\\/spoiler\\])|` +
    `(?:^|(?<=[^@\\w]))(@[a-z0-9_]{3,30})(?=[^a-z0-9_]|$)`,
    "gi"
  );
  const tokens: Token[] = [];
  let lastIndex = 0;
  for (const m of body.matchAll(combined)) {
    const idx = m.index ?? 0;
    if (idx > lastIndex) {
      tokens.push({ type: "text", value: body.slice(lastIndex, idx) });
    }
    const full = m[0];
    if (m[1] !== undefined) {
      // Entity token: [[kind:id(:s:e)?|label]]
      const inner = full.slice(2, -2); // strip [[ and ]]
      const pipeIdx = inner.indexOf("|");
      const ref = inner.slice(0, pipeIdx);
      const label = inner.slice(pipeIdx + 1);
      // Build the lookup key
      const parts = ref.split(":");
      const kind = parts[0].toLowerCase();
      const id = parts[1];
      const key =
        kind === "ep"
          ? `ep:${id}:${parts[2]}:${parts[3]}`
          : `${kind}:${id}`;
      tokens.push({ type: "entity", key, fallbackLabel: label });
    } else if (m[2] !== undefined) {
      // Spoiler token: [spoiler]text[/spoiler]
      const inner = full.replace(/^\[spoiler\]/i, "").replace(/\[\/spoiler\]$/i, "");
      tokens.push({ type: "spoiler", text: inner });
    } else if (m[3] !== undefined) {
      // @user token
      const username = full.replace(/^@/, "").toLowerCase();
      tokens.push({ type: "user", username });
    }
    lastIndex = idx + full.length;
  }
  if (lastIndex < body.length) {
    tokens.push({ type: "text", value: body.slice(lastIndex) });
  }
  return tokens;
}

/** Safe markdown link component — no raw HTML, nofollow/ugc. */
const SAFE_LINK_COMPONENTS: Components = {
  a: ({ href, children }) => (
    <a
      href={href}
      target="_blank"
      rel="nofollow ugc noopener noreferrer"
      className="text-brand hover:underline break-words"
    >
      {children}
    </a>
  ),
  // Render each markdown paragraph INLINE. The renderer tokenizes the body
  // around @mentions / [[entity]] / [spoiler] and routes EACH residual text
  // segment through its own ReactMarkdown pass — so a block-level <p> here makes
  // every segment its own line ("hi @x nice" → three lines, the user-reported
  // mention-on-its-own-line bug). Inline keeps text + mentions flowing on one
  // line. Authored newlines are preserved by the container's `whitespace-pre-wrap`
  // (boundary whitespace is re-emitted in renderToken's text case), so explicit
  // line breaks still render; `\n\n` collapses to a single break (acceptable —
  // an inline-token break is far worse than a tighter paragraph gap).
  p: ({ children }) => <span>{children}</span>,
};

/** Render a single token to a React node. */
function renderToken(token: Token, refs: Map<string, EntityMentionRef>, keyStr: string): React.ReactNode {
  switch (token.type) {
    case "text": {
      // Pass text segments through react-markdown for bold/italic/blockquote/code.
      // react-markdown TRIMS the leading/trailing whitespace of a paragraph's text,
      // which — now that adjacent text segments and mentions render inline (issue 2)
      // — would glue a word onto its neighbouring mention ("hi @bea nice" → "hi@bea
      // nice"). Re-emit the boundary whitespace explicitly (the container is
      // `whitespace-pre-wrap`, so a literal space renders).
      const leadWs = token.value.match(/^\s+/)?.[0] ?? "";
      const trailWs = token.value.match(/\s+$/)?.[0] ?? "";
      const core = token.value.slice(leadWs.length, token.value.length - trailWs.length);
      return (
        <span key={keyStr}>
          {leadWs}
          {core && (
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              allowedElements={[...MARKDOWN_ALLOWED_ELEMENTS]}
              unwrapDisallowed
              skipHtml
              components={SAFE_LINK_COMPONENTS}
            >
              {core}
            </ReactMarkdown>
          )}
          {trailWs}
        </span>
      );
    }
    case "spoiler":
      return <InlineSpoiler key={keyStr} text={token.text} />;
    case "user":
      return (
        <Link
          key={keyStr}
          href={`/u/${token.username}`}
          className="font-medium text-foreground hover:underline"
        >
          @{token.username}
        </Link>
      );
    case "entity": {
      const ref = refs.get(token.key);
      if (ref) {
        // Render a thumbnail chip (matches the composer's mention chip) so a
        // posted mention reads as a recognizable title/person, not bare text.
        return (
          <Link
            key={keyStr}
            href={ref.href}
            className="mx-px inline-flex items-center gap-1 rounded bg-brand/10 px-1.5 py-0.5 align-[-0.15em] text-[0.95em] font-medium leading-none text-brand transition-colors hover:bg-brand/20"
          >
            {ref.imagePath && (
              <span className="relative inline-block h-3.5 w-3.5 shrink-0 overflow-hidden rounded-[3px] bg-muted">
                <Image
                  src={`${TMDB_IMAGE_BASE}/w92${ref.imagePath}`}
                  alt=""
                  fill
                  sizes="14px"
                  className="object-cover"
                  unoptimized
                />
              </span>
            )}
            {ref.name}
          </Link>
        );
      }
      // Unresolved entity (deleted from catalog) — fall back to stored label.
      return <span key={keyStr}>{token.fallbackLabel}</span>;
    }
  }
}

/**
 * Read-only comment renderer (spec §5 rung 1). NO dangerouslySetInnerHTML.
 * Body was sanitized on write (no raw HTML), so react-markdown only ever sees
 * markdown-lite text. We pre-tokenize @user / [[entity]] / [spoiler] into React
 * nodes, then render the residual text segments through react-markdown for
 * bold/italic/blockquote formatting. Tokens are NOT passed through markdown
 * to avoid regex/markdown interaction.
 *
 * Feature-agnostic: takes a canonical body string + optional entity-mention
 * refs (shared by discussion comments AND reviews). Callers that have no
 * resolved mentions pass none — `[[entity]]` tokens then fall back to their
 * stored label.
 */
export function RichTextBody({
  body,
  entityMentions = [],
  status = "PUBLISHED",
  idKey = "rt",
}: {
  body: string;
  entityMentions?: EntityMentionRef[];
  status?: string;
  idKey?: string | number;
}) {
  if (status === "DELETED_BY_USER") {
    return <p className="text-sm text-muted-foreground italic">Deleted by author</p>;
  }

  const refs = buildMentionMap(entityMentions);
  const tokens = tokenize(body);
  const pending = status === "PENDING_REVIEW" || status === "FLAGGED";

  return (
    <div className="text-sm text-foreground/90">
      {pending && (
        <p className="text-[11px] text-muted-foreground italic mb-1">
          Pending review — visible only to you
        </p>
      )}
      <div className="prose-comment whitespace-pre-wrap break-words [&_strong]:font-semibold [&_blockquote]:border-l-2 [&_blockquote]:border-border [&_blockquote]:pl-3 [&_blockquote]:text-muted-foreground">
        {tokens.map((t, i) => renderToken(t, refs, `t-${idKey}-${i}`))}
      </div>
    </div>
  );
}
