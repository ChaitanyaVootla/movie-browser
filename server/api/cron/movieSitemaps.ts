import { Movie } from "~/server/models";
import { getUrlSlug } from "~/utils/slug";
import { createSitemap, getSiteMapDir } from "~/server/utils/sitemap";
import { getLatestMovieData, TMDBMediaType } from "~/server/utils/tmdb_dump";

export default defineEventHandler(async (event) => {
    const CHUNK_SIZE = 48_000;
    const BASE_URL = 'https://themoviebrowser.com';
    let skip = 0;
    let idx = 1;

    const priorityMovieIds = new Set();
    console.log('Creating movie sitemaps...');

    console.log("Creating priority movie sitemaps...");
    while(true) {
        const voteCountMovies = await Movie.find({ vote_count: { $gt: 100 } })
            .select('-_id id title').limit(CHUNK_SIZE).skip(skip);

        if (!voteCountMovies.length) {
            break;
        }

        const URLS = voteCountMovies.map((movie) => `${BASE_URL}/movie/${movie.id}/${getUrlSlug(movie.title as string)}`);
        voteCountMovies.forEach((movie) => priorityMovieIds.add(movie.id));
        const fileName = getSiteMapDir('movie', idx);
        const today = new Date().toISOString().split('T')[0];
        createSitemap(URLS, fileName, '1.0', 'daily', today);

        idx++;
        skip += CHUNK_SIZE;
    }
    console.log(`Priority movie sitemaps created for ${priorityMovieIds.size} movies.`);

    const allMoviesData = await getLatestMovieData(TMDBMediaType.MOVIE);

    const nonPriorityMovies = allMoviesData.filter((movie) => !priorityMovieIds.has(movie.id));

    console.log(`Creating non priority movie sitemaps for ${nonPriorityMovies.length} movies...`);
    let skipNonPriority = 0;
    let nonPriorityIdx = 1;
    while(true) {
        const chunk = nonPriorityMovies.slice(skipNonPriority, skipNonPriority + CHUNK_SIZE);

        const dbMovies = await Movie.find({ id: { $in: chunk.map((movie) => movie.id) } }).select('-_id id title').lean();
        const URLS = dbMovies.map(({ id, title }) => `${BASE_URL}/movie/${id}/${getUrlSlug(title as string)}`);

        if (!URLS.length) {
            break;
        }

        const fileName = getSiteMapDir('movie', nonPriorityIdx, 'non_priority');
        const today = new Date().toISOString().split('T')[0];
        createSitemap(URLS, fileName, '0.8', 'monthly', today);

        console.log(`Created sitemap for movies ${skipNonPriority + 1} to ${skipNonPriority + URLS.length}`);

        nonPriorityIdx++;
        skipNonPriority += CHUNK_SIZE;
    }
    return { status: 200 };
});
