import { Movie, MovieLightFileds } from "~/server/models";

export default defineEventHandler(async (event) => {
    const body = await readBody(event);
    const movieIds = body.movieIds as number[];
    if (!movieIds?.length) {
        event.node.res.statusCode = 400;
        event.node.res.end(`movieIds query param is required`);
    }
    const series = await Movie.find({id: {$in: movieIds}}).select(MovieLightFileds);
    return series;
});
