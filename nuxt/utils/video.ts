/**
 * Finds the primary trailer video from a list of videos
 * Prioritizes official trailers on YouTube, with fallback logic
 */
export function findPrimaryTrailer(videos: any): any {
    if (!videos?.results || videos.results.length === 0) {
        return null;
    }

    const videoList = videos.results;

    // First, try to find an official trailer on YouTube
    const trailer = videoList.find(
        (v: any) => v.type === 'Trailer' && v.site === 'YouTube'
    );

    if (trailer) {
        return trailer;
    }

    // Fallback: Return the first video if available
    return videoList[0] || null;
}

/**
 * Gets just the primary trailer video info
 * This is what should be sent in minimal API responses
 */
export function getPrimaryVideoInfo(videos: any): { results: any[] } {
    const primaryTrailer = findPrimaryTrailer(videos);

    if (!primaryTrailer) {
        return { results: [] };
    }

    return {
        results: [primaryTrailer]
    };
}
