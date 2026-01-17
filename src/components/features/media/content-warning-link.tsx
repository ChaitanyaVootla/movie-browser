import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

interface ContentWarningLinkProps {
  imdbId?: string;
  className?: string;
  size?: "xs" | "sm" | "default";
}

export function ContentWarningLink({ imdbId, className, size = "sm" }: ContentWarningLinkProps) {
  if (!imdbId) return null;

  const isXs = size === "xs";

  return (
    <Link
      href={`https://www.imdb.com/title/${imdbId}/parentalguide`}
      target="_blank"
      rel="noopener noreferrer"
      className={className}
    >
      <span
        className={cn(
          "inline-flex items-center rounded-full bg-secondary text-secondary-foreground cursor-pointer hover:bg-secondary/80 transition-colors font-medium",
          isXs ? "gap-1 px-1.5 h-5 text-[10px]" : "gap-1.5 px-2.5 py-1 text-xs"
        )}
      >
        <AlertTriangle className={cn("shrink-0", isXs ? "h-2.5 w-2.5" : "h-3 w-3")} />
        Content warning
      </span>
    </Link>
  );
}
