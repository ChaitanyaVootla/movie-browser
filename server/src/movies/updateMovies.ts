import { Movie } from "@/db/schemas/Movies";
import { getMovieDetails } from "@/movies/movieDetails";
import { chunk } from "lodash";

const updateMovies = async (movieIds: number[], force = false, skipGoogle = true) => {
    const chunks = chunk(movieIds, 5);
    console.log("Movies total chunks: ", chunks.length);

    let count = 1;
    for (let movieIds of chunks) {
        const getDetailsCalls = movieIds.map(id => getMovieDetails(id, {force, skipGoogle}));
        await Promise.all(getDetailsCalls)
        console.log(`------ Movies chunk ${count++} of ${chunks.length} ------`)
    }

    // add rank
    const topMovies = (await Movie.find({popularity: {$gte: 100}}).sort({popularity: -1})
        .select('id')).map(doc => doc.toJSON());
    let rank = 1;
    for (let movie of topMovies) {
        await Movie.updateOne(
            {id: movie.id},
            {$set:
                {
                    rank: rank++,
                },
            },
        );
    }

    return;
}

export { updateMovies };
