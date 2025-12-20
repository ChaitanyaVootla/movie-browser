import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface ContentWarningLinkProps {
  imdbId?: string;
  className?: string;
  size?: "sm" | "default";
}

export function ContentWarningLink({ imdbId, className, size = "sm" }: ContentWarningLinkProps) {
  if (!imdbId) return null;

  return (
    <Link
      href={`https://www.imdb.com/title/${imdbId}/parentalguide`}
      target="_blank"
      rel="noopener noreferrer"
      className={className}
    >
      <Button
        variant="secondary"
        size={size}
        className={cn(
          "gap-1.5 text-muted-foreground hover:text-foreground transition-colors",
          size === "sm" && "text-xs h-7 px-2.5"
        )}
      >
        <AlertTriangle className={cn("shrink-0", size === "sm" ? "h-3.5 w-3.5" : "h-4 w-4")} />
        Content warning
      </Button>
    </Link>
  );
}


