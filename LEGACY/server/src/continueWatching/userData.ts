import { dbConstants } from "@/db/constants";
import { ContinueWatching, IContinueWatching } from "@/db/schemas/continueWatching";
import { TokenPayload } from "google-auth-library";

const getUserContinueWatching = async (user: TokenPayload): Promise<IContinueWatching[]> => {
    const continueWatchingMovies = await ContinueWatching.aggregate([
        {
            $match: {userId: user.sub, isMovie: true}
        },
        {
            $project: {
                id: '$itemId',
                updatedAt: '$updatedAt',
                watchLink: '$watchLink',
            }
        },
        {
            $lookup: {
                from: dbConstants.collections.movies,
                as: 'movie',
                localField: 'id',
                foreignField: 'id',
                pipeline: [
                    {
                        $project: {
                            id: '$id',
                            title: '$title',
                            backdrop_path: '$backdrop_path',
                            vote_average: '$vote_average',
                            overview: '$overview',
                            genres: '$genres',
                            googleData: '$googleData',
                            _id: 0,
                        }
                    }
                ]
            }
        },
        {
            $replaceRoot: { newRoot: { $mergeObjects: [ { $arrayElemAt: [ "$movie", 0 ] }, "$$ROOT" ] } }
        },
        {
            $project: {
                movie: 0,
            }
        },
        {
            $addFields: {
                isMovie: true,
            }
        },
    ]);
    const continueWatchingSeries = await ContinueWatching.aggregate([
        {
            $match: {userId: user.sub, isMovie: false}
        },
        {
            $project: {
                id: '$itemId',
                updatedAt: '$updatedAt',
                watchLink: '$watchLink',
            }
        },
        {
            $lookup: {
                from: dbConstants.collections.series,
                as: 'series',
                localField: 'id',
                foreignField: 'id',
                pipeline: [
                    {
                        $project: {
                            id: '$id',
                            name: '$name',
                            backdrop_path: '$backdrop_path',
                            vote_average: '$vote_average',
                            first_air_date: '$first_air_date',
                            overview: '$overview',
                            genres: '$genres',
                            googleData: '$googleData',
                            _id: 0,
                        }
                    }
                ]
            }
        },
        {
            $replaceRoot: { newRoot: { $mergeObjects: [ { $arrayElemAt: [ "$series", 0 ] }, "$$ROOT" ] } }
        },
        {
            $project: {
                series: 0,
            }
        },
        {
            $addFields: {
                isMovie: false,
            }
        },
    ]);
    return continueWatchingMovies.concat(continueWatchingSeries);
}

export { getUserContinueWatching };
