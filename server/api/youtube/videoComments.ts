
export default defineEventHandler(async (event) => {
    const videoId = ((getQuery(event).videoId as string) || '');
    if (!videoId || !videoId.length) {
        event.node.res.statusCode = 400;
        event.node.res.end(`videoId query param is required`);
    }
    const youtubeResonse: any = await $fetch(`https://www.googleapis.com/youtube/v3/commentThreads?videoId=${
        videoId}&part=id,replies,snippet&order=relevance&maxResults=100&key=${process.env.YOUTUBE_API_KEY}`);
    return youtubeResonse?.items || [];
});
