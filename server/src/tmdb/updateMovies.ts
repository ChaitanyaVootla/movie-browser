import { getMovieDetails } from "@/movies/movieDetails";
import { chunk } from "lodash"

const updateMovies = async (movieIds: number[]) => {
    const chunks = chunk(movieIds, 5);
    for (let movieIds of chunks) {
        const getDetailsCalls = movieIds.map(id => getMovieDetails(id));
        await Promise.all(getDetailsCalls)
    }
    return;
}

export { updateMovies };
