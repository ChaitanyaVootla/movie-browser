import Link from "next/link";
import Image from "next/image";
import type { HubThreadCard as Card } from "@/server/db/postgres/social/discussion-hub";
import { CueBadge } from "@/components/features/discussion/cue-badge";

const TMDB_IMAGE_BASE = "https://image.tmdb.org/t/p";

export function HubThreadCard({ card }: { card: Card }) {
  const poster = card.anchor.posterPath ? `${TMDB_IMAGE_BASE}/w154${card.anchor.posterPath}` : null;
  const who = card.author.username ?? card.author.name ?? "Someone";
  return (
    <Link
      href={card.href}
      prefetch={false}
      className="flex gap-3 rounded-lg border border-border bg-card p-3 transition-colors hover:bg-accent/40"
    >
      {poster ? (
        <Image
          src={poster}
          alt={card.anchor.title}
          width={48}
          height={72}
          unoptimized
          className="h-[72px] w-12 shrink-0 rounded object-cover"
        />
      ) : (
        <div className="h-[72px] w-12 shrink-0 rounded bg-muted" />
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="truncate font-medium text-foreground">{card.anchor.title}</span>
          {card.isCue ? <CueBadge /> : <span className="truncate">· {who}</span>}
        </div>
        <p className="mt-1 line-clamp-2 text-sm text-foreground">{card.body}</p>
        <div className="mt-1.5 text-xs text-muted-foreground">{card.likeCount} likes</div>
      </div>
    </Link>
  );
}
