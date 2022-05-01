import axios from 'axios';
import fs from 'fs';

const QUERY_PARAMS =
    '&append_to_response=videos,images,credits,similar,recommendations,keywords,external_ids,' +
    'alternative_titles,release_dates,reviews,translations';
const tmdbKey = '40d0d5cd9342dfe3e629ea9a7daa4f23';

const getLatestMovie = async () => {
    const { data } = await axios.get(`http://api.themoviedb.org/3/movie/latest?api_key=${tmdbKey}${QUERY_PARAMS}`);
    return data;
};

const fetchAllMovies = async (latestMovieId: number) => {
    let allMovies = [];
    const allErrors = [];
    let currentMovieId = 0;
    const parallelRequestsCount = 10;

    // get last movie id from dump
    const dumpfiles = fs.readdirSync(__dirname + '/dump/');
    if (dumpfiles.length) {
        const fileIds = dumpfiles.map((file) => parseInt(file.split('-')[1]));
        const closingID = Math.max(...fileIds);
        const latestFileMovies = JSON.parse(fs.readFileSync(__dirname + '/dump/' + `movies-${closingID}.json`, 'utf8'));
        const lastMovie = latestFileMovies[latestFileMovies.length - 1];
        currentMovieId = lastMovie.id + 1;
        console.log(`Starting where we left off ID: ${lastMovie.id} ${lastMovie.title}`);
    } else {
        console.log(`Starting from the beginning`);
    }
    while (currentMovieId <= latestMovieId) {
        const calls = [];
        const errors = [];
        let notFounds = 0;
        for (let i = 1; i <= parallelRequestsCount; i++) {
            calls.push(
                axios
                    .get(`http://api.themoviedb.org/3/movie/${currentMovieId++}?api_key=${tmdbKey}${QUERY_PARAMS}`)
                    .catch((e) => {
                        let err = 'Call errored out: ' + e.response?.data?.status_message;
                        if (e.response?.data?.status_code === 34) {
                            notFounds++;
                        } else {
                            err = 'Call errored out: ' + e.response?.data?.toString();
                        }
                        errors.push(err);
                    }),
            );
        }
        let responses = await Promise.all(calls);
        responses = responses.filter((response) => response?.data?.title);
        const movies = responses.map((response) => response.data);
        console.log(`current ID: ${currentMovieId}, ${((currentMovieId / latestMovieId) * 100).toFixed(4)}% done`);
        // console.log(movies.map(movie => movie.title));
        if (movies.length + notFounds !== parallelRequestsCount) {
            console.error('something gone wrong', errors);
            return false;
        }
        if (allMovies.length >= 40) {
            fs.writeFileSync(__dirname + `/dump/movies-${currentMovieId}.json`, JSON.stringify(allMovies, null, 4));
            allMovies = [];
        }
        allMovies.push(...movies);
        allErrors.push(...errors);
    }
    return true;
};

const scraper = async () => {
    const latestMovie: any = await getLatestMovie();
    const status = await fetchAllMovies(latestMovie.id);
    if (!status) {
        setTimeout(() => scraper(), 1000 * 20);
    }
};

scraper();
