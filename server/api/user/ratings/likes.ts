import { JWT } from "next-auth/jwt";
import { UserRating } from "~/server/models";

export default defineEventHandler(async (event) => {
    const userData = event.context.userData as JWT;
    if (!userData || !userData?.sub) {
        event.node.res.statusCode = 401;
        event.node.res.end(`Unauthorized`);
    }

    const likes = await UserRating.find({userId: userData.sub, rating: 1})
    const movieIds: number[] = [];
    const seriesIds: number[] = [];
    let movies: any[] = [];
    let series: any[] = [];
    likes.forEach((like) => like.itemType === 'movie' ? movieIds.push(like.itemId) : seriesIds.push(like.itemId));
    if (movieIds.length) {
        movies = await $fetch(`/api/movie/getMultiple?movieIds=${movieIds.join(',')}`);
    }
    if (seriesIds.length) {
        series = await $fetch(`/api/series/getMultiple?seriesIds=${seriesIds.join(',')}`);
    }
    return {
        movies,
        series
    }
});
