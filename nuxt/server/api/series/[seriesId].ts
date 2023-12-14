export default defineEventHandler(async (event) => {
    const seriesId = getRouterParam(event, 'seriesId');
    const series: any = await $fetch(`https://themoviebrowser.com/node/seriesDetails/${seriesId}`).catch((error: Error) => {
        return {};
    });
    if (!series) {
        event.node.res.statusCode = 404;
        event.node.res.end(`Series not found for id: ${series}`);
    }
    return series;
});
