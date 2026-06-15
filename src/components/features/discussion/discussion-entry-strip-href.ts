import { getMediaPath } from "@/lib/utils";
import type { DiscussionAnchor } from "@/server/services/discussion/comment-schemas";

/** Dedicated discussion-page URL for an anchor (title used only for the slug). */
export function discussionsHref(anchor: DiscussionAnchor, title: string | null): string {
  const base =
    anchor.type === "movie"
      ? getMediaPath("movie", anchor.movieId, title)
      : getMediaPath("series", anchor.seriesId, title);
  return `${base}/discussions`;
}
