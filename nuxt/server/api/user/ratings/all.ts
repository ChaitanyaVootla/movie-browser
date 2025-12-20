import { JWT } from "next-auth/jwt";
import { UserRating } from "~/server/models";

export default defineEventHandler(async (event) => {
    const userData = event.context.userData as JWT;
    if (!userData || !userData?.sub) {
        event.node.res.statusCode = 401;
        event.node.res.end(`Unauthorized`);
    }

    const ratings = await UserRating.find({userId: userData.sub})
    const movieIds: number[] = [];
    const seriesIds: number[] = [];
    let movies: any[] = [];
    let series: any[] = [];
    ratings.forEach((rating) => rating.itemType === 'movie' ? movieIds.push(rating.itemId) : seriesIds.push(rating.itemId));
    if (movieIds.length) {
        movies = await $fetch(`/api/movie/getMultiple?movieIds=${movieIds.join(',')}`);
    }
    if (seriesIds.length) {
        series = await $fetch(`/api/series/getMultiple?seriesIds=${seriesIds.join(',')}`);
    }
    return {
        likes: {
            movies: movies.filter((movie) => ratings.find((rating) => rating.itemId === movie.id && rating.rating === 1)),
            series: series.filter((serie) => ratings.find((rating) => rating.itemId === serie.id && rating.rating === 1))
        },
        dislikes: {
            movies: movies.filter((movie) => ratings.find((rating) => rating.itemId === movie.id && rating.rating === -1)),
            series: series.filter((serie) => ratings.find((rating) => rating.itemId === serie.id && rating.rating === -1))
        }
    }
});
