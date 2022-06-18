const axios = require('axios').default;
const tmdb = require('./index');

async function tmdbPassthrough(path) {
    const url = `${tmdb.BASE_URL}${path}${path.includes('?')?'':'?'}&api_key=${process.env.TMDB_API_KEY}`;
    console.log(url)
    const {data: details} = await axios.get(url);
    return details;
}

module.exports = tmdbPassthrough;
