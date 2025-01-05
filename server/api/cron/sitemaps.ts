// import { Movie, Series } from "~/server/models";
// import { getUrlSlug } from "~/utils/slug";
// import { createSitemap, getSiteMapDir, updateSiteMapIndex } from "~/server/utils/sitemap";
// import { getLatestMovieData, getLatestPersonData } from "~/server/utils/tmdb_dump";
// import { syncMoviesAndSeries } from "./syncTMDBData";

// const CHUNK_SIZE = 20_000;
// const BASE_URL = 'https://themoviebrowser.com';

// export default defineEventHandler(async (event) => {
//     updateSiteMaps();
//     return { status: 200 };
// });

// export const updateSiteMaps = async () => {
//     await syncMoviesAndSeries();
//     updateMovieSitemaps().then(() => updateSeriesSitemaps()).then(() => updatePersonSitemaps())
//         .then(() => updateSiteMapIndex());
//     return { status: 200 };
// }

// export const updateMovieSitemaps = async () => {
//     let skip = 0;
//     let idx = 1;

//     const priorityMovieIds = new Set();
//     console.log('Creating movie sitemaps...');

//     console.log("Creating priority movie sitemaps...");
//     while(true) {
//         const voteCountMovies = await Movie.find({ vote_count: { $gt: 100 } })
//             .select('-_id id title').limit(CHUNK_SIZE).skip(skip);

//         if (!voteCountMovies.length) {
//             break;
//         }

//         const URLS = voteCountMovies.map((movie) => `${BASE_URL}/movie/${movie.id}/${getUrlSlug(movie.title as string)}`);
//         voteCountMovies.forEach((movie) => priorityMovieIds.add(movie.id));
//         const fileName = getSiteMapDir('movie', idx);
//         const today = new Date().toISOString().split('T')[0];
//         createSitemap(URLS, fileName, '1.0', 'daily', today);

//         idx++;
//         skip += CHUNK_SIZE;
//     }
//     console.log(`Priority movie sitemaps created for ${priorityMovieIds.size} movies.`);

//     const allMoviesData = await getLatestMovieData();

//     const nonPriorityMovies = allMoviesData.filter((movie) => !priorityMovieIds.has(movie.id));

//     console.log(`Creating non priority movie sitemaps for ${nonPriorityMovies.length} movies...`);
//     let skipNonPriority = 0;
//     let nonPriorityIdx = 1;
//     while(true) {
//         const chunk = nonPriorityMovies.slice(skipNonPriority, skipNonPriority + CHUNK_SIZE);

//         const dbMovies = await Movie.find({ id: { $in: chunk.map((movie) => movie.id) } }).select('-_id id title').lean();
//         const URLS = dbMovies.map(({ id, title }) => `${BASE_URL}/movie/${id}/${getUrlSlug(title as string)}`);

//         if (!URLS.length) {
//             break;
//         }

//         const fileName = getSiteMapDir('movie', nonPriorityIdx, 'non_priority');
//         const today = new Date().toISOString().split('T')[0];
//         createSitemap(URLS, fileName, '0.8', 'monthly', today);

//         console.log(`Created sitemap for movies ${skipNonPriority + 1} to ${skipNonPriority + URLS.length}`);

//         nonPriorityIdx++;
//         skipNonPriority += CHUNK_SIZE;
//     }
//     return { status: 200 };
// };

// export const updateSeriesSitemaps = async () => {
//     let skip = 0;
//     let idx = 1;

//     const prioritySeriesIds = new Set();
//     console.log('Creating Series sitemaps...');

//     console.log("Creating priority Series sitemaps...");
//     while(true) {
//         const voteCountSeries = await Series.find({ vote_count: { $gt: 100 } })
//             .select('-_id id name').limit(CHUNK_SIZE).skip(skip);

//         if (!voteCountSeries.length) {
//             break;
//         }

//         const URLS = voteCountSeries.map(({ id, name }) => `${BASE_URL}/series/${id}/${getUrlSlug(name as string)}`);
//         voteCountSeries.forEach((series) => prioritySeriesIds.add(series.id));
//         const fileName = getSiteMapDir('series', idx);
//         const today = new Date().toISOString().split('T')[0];
//         createSitemap(URLS, fileName, '1.0', 'daily', today);

//         idx++;
//         skip += CHUNK_SIZE;
//     }
//     console.log(`Priority Series sitemaps created for ${prioritySeriesIds.size} series.`);

//     const allSeriesData = await getLatestSeriesData();

//     const nonPrioritySeries = allSeriesData.filter(({ id }) => !prioritySeriesIds.has(id));

//     console.log(`Creating non priority series sitemaps for ${nonPrioritySeries.length} series...`);
//     let skipNonPriority = 0;
//     let nonPriorityIdx = 1;
//     while(true) {
//         const chunk = nonPrioritySeries.slice(skipNonPriority, skipNonPriority + CHUNK_SIZE);

//         const dbSeries = await Series.find({ id: { $in: chunk.map(({ id }) => id) } }).select('-_id id name').lean();
//         const URLS = dbSeries.map(({ id, name }) => `${BASE_URL}/series/${id}/${getUrlSlug(name as string)}`);

//         if (!URLS.length) {
//             break;
//         }

//         const fileName = getSiteMapDir('series', nonPriorityIdx, 'non_priority');
//         const today = new Date().toISOString().split('T')[0];
//         createSitemap(URLS, fileName, '0.8', 'monthly', today);

//         console.log(`Created sitemap for series ${skipNonPriority + 1} to ${skipNonPriority + URLS.length}`);

//         nonPriorityIdx++;
//         skipNonPriority += CHUNK_SIZE;
//     }
//     return { status: 200 };
// };

// export const updatePersonSitemaps = async () => {
//     const PRIOTITY_CUTOFF = 10;

//     console.log('Creating Person sitemaps...');

//     console.log("Creating priority Person sitemaps...");
    
//     const allPersonsData = await getLatestPersonData();

//     const priorityPersons: any[] = [];
//     const nonPriorityPersons: any[] = [];
//     allPersonsData.forEach((person) => {
//         if (person.popularity >= PRIOTITY_CUTOFF) {
//             priorityPersons.push(person);
//         } else if (person.popularity > 1) {
//             nonPriorityPersons.push(person);
//         }
//     });

//     console.log(`Creating priority person sitemaps for ${priorityPersons.length} persons...`);
//     let skipPriority = 0;
//     let priorityIdx = 1;
    
//     for (let i = 0; i < priorityPersons.length; i += CHUNK_SIZE) {
//         const chunk = priorityPersons.slice(i, i + CHUNK_SIZE);

//         const URLS = chunk.map(({ id, name }) => `${BASE_URL}/person/${id}/${getUrlSlug(name as string)}`);
//         const fileName = getSiteMapDir('person', priorityIdx);
//         const today = new Date().toISOString().split('T')[0];
//         createSitemap(URLS, fileName, '1.0', 'daily', today);

//         console.log(`Created sitemap for persons ${skipPriority + 1} to ${skipPriority + URLS.length}`);

//         priorityIdx++;
//         skipPriority += CHUNK_SIZE;
//     }

//     console.log(`Priority person sitemaps created for ${priorityPersons.length} persons.`);

//     console.log(`Creating non priority person sitemaps for ${nonPriorityPersons.length} persons...`);
//     let skipNonPriority = 0;
//     let nonPriorityIdx = 1;
//     for (let i = 0; i < nonPriorityPersons.length; i += CHUNK_SIZE) {
//         const chunk = nonPriorityPersons.slice(i, i + CHUNK_SIZE);

//         const URLS = chunk.map(({ id, name }) => `${BASE_URL}/person/${id}/${getUrlSlug(name as string)}`);
//         const fileName = getSiteMapDir('person', nonPriorityIdx, 'non_priority');
//         const today = new Date().toISOString().split('T')[0];
//         createSitemap(URLS, fileName, '0.8', 'weekly', today);

//         console.log(`Created sitemap for persons ${skipNonPriority + 1} to ${skipNonPriority + URLS.length}`);

//         nonPriorityIdx++;
//         skipNonPriority += CHUNK_SIZE;
//     }
// };
