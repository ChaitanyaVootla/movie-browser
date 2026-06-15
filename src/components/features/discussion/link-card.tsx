import { ExternalLink } from "lucide-react";
import type { LinkCardLite } from "@/server/db/postgres/comments";
import { LiteYouTube } from "./lite-youtube";

/**
 * Renders a cached link as a rich preview card. Server component — reads ONLY the
 * cached card data (no network, no viewer state → safe in ISR HTML). All outbound
 * links carry rel="nofollow ugc noopener noreferrer" target="_blank".
 *
 * Image policy (spec §5, rung 7 image-proxy DEFERRED — option (a)): we do NOT
 * hotlink arbitrary external og:image URLs. Rich imagery is reserved for
 * allowlisted providers (YouTube via the facade thumbnail). Generic cards show
 * text + domain + favicon only. The og:image is stored for the future proxy.
 */
const REL = "nofollow ugc noopener noreferrer";

export function LinkCard({ card }: { card: LinkCardLite }) {
  if (card.status !== "OK") {
    return <SafeAnchor url={card.url} label={card.url} />;
  }

  if (card.provider === "YOUTUBE" && card.youtubeId) {
    return <LiteYouTube id={card.youtubeId} title={card.title ?? "YouTube video"} />;
  }

  return (
    <a
      href={card.url}
      target="_blank"
      rel={REL}
      className="mt-2 flex max-w-md items-stretch gap-3 rounded-lg border border-border bg-card p-3 transition-colors hover:bg-accent/50"
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          {/* Favicon host is a single known-safe endpoint (Google s2), not the
              arbitrary target domain. Kept as a plain <img> (small, decorative). */}
          {card.faviconUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={card.faviconUrl} alt="" width={16} height={16} className="rounded-sm" />
          )}
          <span className="truncate">{card.domain}</span>
        </div>
        {card.title && (
          <p className="mt-1 line-clamp-2 text-sm font-medium text-foreground">{card.title}</p>
        )}
        {card.description && (
          <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{card.description}</p>
        )}
      </div>
      <ExternalLink className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
    </a>
  );
}

function SafeAnchor({ url, label }: { url: string; label: string }) {
  return (
    <a
      href={url}
      target="_blank"
      rel={REL}
      className="break-all text-sm text-foreground underline underline-offset-2 hover:text-foreground/80"
    >
      {label}
    </a>
  );
}
