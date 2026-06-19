import Link from "next/link";

const MENTION_SPLIT_RE = /((?:^|[^\w@])@[a-z0-9_]{3,30}\b)/gi;

/** Renders a comment body, linkifying @username → /u/username. Plain text otherwise. */
export function MentionText({ body }: { body: string }) {
  const parts = body.split(MENTION_SPLIT_RE);
  return (
    <span className="whitespace-pre-wrap break-words">
      {parts.map((part, i) => {
        const match = /^(.?)@([a-z0-9_]{3,30})$/i.exec(part);
        if (!match) return <span key={i}>{part}</span>;
        return (
          <span key={i}>
            {match[1]}
            <Link
              href={`/u/${match[2].toLowerCase()}`}
              className="text-foreground font-medium hover:underline"
            >
              @{match[2]}
            </Link>
          </span>
        );
      })}
    </span>
  );
}
