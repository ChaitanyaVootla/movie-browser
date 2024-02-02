import { Movie, MovieLightFileds } from "~/server/models";

export default defineEventHandler(async (event) => {
    const movieIds = (getQuery(event).movieIds as string).split(',').map((id) => parseInt(id)) as number[];
    if (!movieIds || !movieIds.length) {
        event.node.res.statusCode = 400;
        event.node.res.end(`movieIds query param is required`);
    }
    const series = await Movie.find({id: {$in: movieIds}}).select(MovieLightFileds);
    return series;
});
