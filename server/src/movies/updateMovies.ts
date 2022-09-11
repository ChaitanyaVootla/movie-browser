import { getMovieDetails } from "@/movies/movieDetails";
import { chunk } from "lodash";

const updateMovies = async (movieIds: number[]) => {
    const chunks = chunk(movieIds, 5);
    console.log("Movies total chunks: ", chunks.length);
 
    let count = 0;
    for (let movieIds of chunks) {
        const getDetailsCalls = movieIds.map(id => getMovieDetails(id, {force: false, skipGoogle: false}));
        await Promise.all(getDetailsCalls)
        console.log(`------ Movies chunk ${count++} of ${chunks.length} ------`)
    }
    return;
}

export { updateMovies };
