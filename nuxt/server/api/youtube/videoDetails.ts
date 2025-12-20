export default defineEventHandler(async (event) => {
    const videoIds = ((getQuery(event).videoIds as string) || '').split(',') as string[];
    if (!videoIds || !videoIds.length) {
        event.node.res.statusCode = 400;
        event.node.res.end(`videoIds query param is required`);
    }
    const youtubeResonse: any = await $fetch(`https://www.googleapis.com/youtube/v3/videos?part=contentDetails,id,liveStreamingDetails,localizations,player,recordingDetails,snippet,statistics,status,topicDetails&id=${
        videoIds.join(',')}&maxResults=50&key=${process.env.YOUTUBE_API_KEY}`);
    return youtubeResonse?.items || [];
});
