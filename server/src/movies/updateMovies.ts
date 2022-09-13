import { getMovieDetails } from "@/movies/movieDetails";
import { chunk } from "lodash";

const updateMovies = async (movieIds: number[], force = false) => {
    const chunks = chunk(movieIds, 5);
    console.log("Movies total chunks: ", chunks.length);
 
    let count = 1;
    for (let movieIds of chunks) {
        const getDetailsCalls = movieIds.map(id => getMovieDetails(id, {force, skipGoogle: false}));
        await Promise.all(getDetailsCalls)
        console.log(`------ Movies chunk ${count++} of ${chunks.length} ------`)
    }
    return;
}

export { updateMovies };
