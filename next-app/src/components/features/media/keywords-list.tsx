import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { buildBrowseUrl } from "@/lib/discover";
import type { Keyword } from "@/types";

interface KeywordsListProps {
  keywords: Keyword[];
  mediaType: "movie" | "series";
  maxVisible?: number;
  className?: string;
}

export function KeywordsList({
  keywords,
  mediaType,
  maxVisible = 8,
  className,
}: KeywordsListProps) {
  if (!keywords?.length) return null;

  const visibleKeywords = keywords.slice(0, maxVisible);
  const remainingCount = keywords.length - maxVisible;

  // Build discover URL for keyword
  const getKeywordUrl = (keyword: Keyword) => {
    return buildBrowseUrl({
      media_type: mediaType === "movie" ? "movie" : "tv",
      with_keywords: [keyword.id],
    });
  };

  return (
    <div className={cn("flex flex-wrap gap-2", className)}>
      {visibleKeywords.map((keyword) => (
        <Link key={keyword.id} href={getKeywordUrl(keyword)}>
          <Badge
            variant="secondary"
            className="cursor-pointer hover:bg-secondary/80 transition-colors text-xs font-normal"
          >
            {keyword.name}
          </Badge>
        </Link>
      ))}
      {remainingCount > 0 && (
        <Badge variant="outline" className="text-xs font-normal text-muted-foreground">
          +{remainingCount} more
        </Badge>
      )}
    </div>
  );
}

