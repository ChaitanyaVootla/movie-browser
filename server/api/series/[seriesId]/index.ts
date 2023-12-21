import { ISeries, Series } from "~/server/models";

export default defineEventHandler(async (event) => {
    const seriesId = getRouterParam(event, 'seriesId');
    if (!seriesId) {
        event.node.res.statusCode = 404;
        event.node.res.end(`Series not found for id: ${seriesId}`);
    }

    let series = {} as any;
    const dbSeries = Series.findOne({ id: seriesId });
    if (dbSeries) {
        series = dbSeries;
    }
    if (!series.title) {
        series = await $fetch(`https://themoviebrowser.com/node/seriesDetails/${seriesId}`).catch((error: Error) => {
            return {};
        });
    }
    if (!series) {
        event.node.res.statusCode = 404;
        event.node.res.end(`Series not found for id: ${series}`);
    }

    const latestSeasonNumber = series.seasons[series.seasons.length - 1]?.season_number;
    if (latestSeasonNumber) {
        series.selectedSeason = await $fetch(`/api/series/${seriesId}/season/${latestSeasonNumber}`);
    }
    return series as ISeries;
});
